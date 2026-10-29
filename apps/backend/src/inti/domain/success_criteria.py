import re
from dataclasses import asdict, replace
from uuid import uuid5

from inti.domain.execution import AuthorizationStatus, ExecutionBundle, ExecutionError, fingerprint
from inti.domain.planning import PlannedActionType
from inti.domain.verification import (
    AssertionType,
    BaselineReference,
    CriteriaVersion,
    EvidenceRequirement,
    EvidenceType,
    ExpectedValue,
    SuccessCriterion,
    TargetReference,
    canonical_bytes,
    content_hash,
)
from inti.domain.verification_ports import ReadOnlySnapshot


class SuccessCriteriaEngine:
    """Recognized inventory objectives are bound to exact approved values, never model guesses."""

    def approved_task(self, execution: ExecutionBundle) -> None:
        manifest = execution.manifest
        if (
            not execution.plan_approved
            or fingerprint(replace(manifest, digest="")) != manifest.digest
        ):
            raise ExecutionError(
                "APPROVAL_REQUIRED", "Verification needs the exact approved task manifest"
            )
        if fingerprint(manifest.plan_snapshot) != manifest.plan_digest:
            raise ExecutionError(
                "APPROVAL_INVALIDATED", "Original task snapshot no longer matches its digest"
            )
        for action in manifest.actions:
            if not any(
                d.action_id == action.id
                and d.manifest_digest == manifest.digest
                and d.decision == AuthorizationStatus.APPROVED
                for d in execution.decisions
            ):
                raise ExecutionError(
                    "APPROVAL_REQUIRED", "Original action scope is not fully authorized"
                )

    def build(self, execution: ExecutionBundle) -> CriteriaVersion:
        self.approved_task(execution)
        goal = execution.manifest.plan_snapshot.plan.goal.strip()
        record_ids = set(re.findall(r"\b[A-Z]{1,8}-[0-9]{1,8}\b", goal))
        options = {
            a.parameters.option
            for a in execution.manifest.actions
            if a.action_type == PlannedActionType.SELECT_OPTION and a.parameters.option
        }
        if len(record_ids) != 1 or len(options) != 1:
            raise ExecutionError(
                "CRITERIA_REQUIRE_DEFINITION",
                "A unique approved inventory record and status are required",
            )
        record, expected = next(iter(record_ids)), next(iter(options))
        record_re, status_re = re.escape(record), re.escape(expected)
        pattern = (
            rf"(?:Find (?:asset )?{record_re} and change its status to {status_re}|"
            rf"(?:Change|Set) (?:asset )?{record_re}(?:'s)? status to {status_re})\.?\s*"
        )
        if not re.fullmatch(pattern, goal, re.IGNORECASE):
            raise ExecutionError(
                "CRITERIA_REQUIRE_DEFINITION",
                "This objective needs an explicit approved criteria definition",
            )
        task = execution.session.task_id
        db = (EvidenceRequirement(EvidenceType.DATABASE_STATE),)
        definitions: tuple[
            tuple[
                str, str, AssertionType, ExpectedValue, str, tuple[EvidenceRequirement, ...], bool
            ],
            ...,
        ] = (
            (
                "exists",
                f"Asset {record} exists in the persisted store",
                AssertionType.EXISTS,
                True,
                "id",
                db,
                True,
            ),
            (
                "status",
                f"Asset {record} has persisted status {expected}",
                AssertionType.EQUALS,
                expected,
                "status",
                db,
                True,
            ),
            (
                "persisted",
                f"Asset {record} status is stable across fresh persisted reads",
                AssertionType.RECORD_PERSISTED,
                expected,
                "status",
                (EvidenceRequirement(EvidenceType.DATABASE_STATE, 2),),
                True,
            ),
            (
                "transition",
                "Observed pre/post transition, when a pre-execution baseline exists",
                AssertionType.STATE_TRANSITION,
                {"before": None, "after": expected},
                "status",
                db,
                False,
            ),
            (
                "unrelated",
                "No unrelated assets changed since the pre-execution baseline, when available",
                AssertionType.EQUALS,
                None,
                "inventory_digest",
                db,
                False,
            ),
        )
        criteria = tuple(
            SuccessCriterion(
                task,
                description,
                kind,
                value,
                TargetReference(record, field),
                requirements,
                required,
                uuid5(task, f"{execution.session.id}:{key}"),
            )
            for key, description, kind, value, field, requirements, required in definitions
        )
        actor = execution.decisions[0].approved_by
        return CriteriaVersion(
            task,
            execution.session.id,
            goal,
            execution.manifest.digest,
            1,
            criteria,
            actor,
            "Persisted-state checks derived from the exact approved inventory objective",
        ).sealed()

    def attach_baseline(
        self, version: CriteriaVersion, reference: BaselineReference, snapshot: ReadOnlySnapshot
    ) -> CriteriaVersion:
        if (
            snapshot.request.collection_id != version.id
            or snapshot.request.execution_id != version.execution_id
            or snapshot.request.task_id != version.task_id
        ):
            raise ExecutionError(
                "BASELINE_SCOPE_MISMATCH", "Baseline does not belong to this criteria version"
            )
        record = version.criteria[0].target_reference.record_id
        asset = next((row for row in snapshot.records if row.id == record), None)
        unrelated = [asdict(row) for row in snapshot.records if row.id != record]
        digest = content_hash(canonical_bytes(sorted(unrelated, key=lambda row: row["id"])))
        criteria = tuple(
            replace(
                c,
                expected_value={
                    "before": asset.status if asset else None,
                    "after": c.expected_value["after"],
                },
            )
            if c.assertion_type == AssertionType.STATE_TRANSITION
            and isinstance(c.expected_value, dict)
            else replace(c, expected_value=digest, required=True)
            if c.target_reference.field == "inventory_digest"
            else c
            for c in version.criteria
        )
        return replace(version, criteria=criteria, baseline=reference).sealed()

    def append_version(
        self,
        current: CriteriaVersion,
        additional: tuple[SuccessCriterion, ...],
        operator: str,
        reason: str,
    ) -> CriteriaVersion:
        if not additional or not reason.strip() or len(reason) > 500:
            raise ExecutionError(
                "INVALID_CRITERIA_REVISION",
                "An explicit reason and additional criteria are required",
            )
        record = current.criteria[0].target_reference.record_id
        if any(
            c.task_id != current.task_id or c.target_reference.record_id != record
            for c in additional
        ):
            raise ExecutionError(
                "CRITERIA_SCOPE_CHANGED",
                "A criteria revision cannot inspect an unrelated task or record",
            )
        # Existing mandatory checks are never rewritten or removed.
        return CriteriaVersion(
            current.task_id,
            current.execution_id,
            current.objective,
            current.original_manifest_digest,
            current.version + 1,
            (*current.criteria, *additional),
            operator,
            reason,
            current.baseline,
        ).sealed()
