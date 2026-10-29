from typing import Any, cast

from inti.domain.verification import (
    AssertionType,
    CriterionResult,
    CriterionStatus,
    EvidenceType,
    ExpectedValue,
    SuccessCriterion,
    ValidatedEvidence,
    canonical_bytes,
    content_hash,
)


class AssertionEvaluator:
    """Screenshots and execution flags never establish a persisted business value."""

    def evaluate(
        self, criterion: SuccessCriterion, evidence: tuple[ValidatedEvidence, ...]
    ) -> CriterionResult:
        target = criterion.target_reference
        relevant = [
            view
            for view in evidence
            if view.valid and view.evidence.metadata.target_record_id == target.record_id
        ]
        final = [view for view in relevant if view.evidence.metadata.role == "final"]
        ids = tuple(view.evidence.id for view in relevant)

        def result(
            status: CriterionStatus, value: ExpectedValue, explanation: str
        ) -> CriterionResult:
            return CriterionResult(
                criterion.id, status, value, criterion.expected_value, ids, explanation
            )

        for requirement in criterion.evidence_requirements:
            captures = {
                view.evidence.metadata.nonce
                for view in final
                if view.evidence.evidence_type == requirement.evidence_type
            }
            if len(captures) < requirement.min_count:
                return result(
                    CriterionStatus.UNKNOWN,
                    None,
                    "Required fresh, trustworthy evidence is unavailable",
                )
        kind = criterion.assertion_type
        if kind in {AssertionType.URL_MATCHES, AssertionType.ELEMENT_VISIBLE}:
            dom = [
                view for view in final if view.evidence.evidence_type == EvidenceType.DOM_SNAPSHOT
            ]
            if not dom:
                return result(
                    CriterionStatus.UNKNOWN, None, "Independent fresh DOM evidence is unavailable"
                )
            values = [
                view.content.get("url")
                if kind == AssertionType.URL_MATCHES
                else view.content.get("visible")
                for view in dom
            ]
            if any(value != values[0] for value in values) or values[0] is None:
                return result(
                    CriterionStatus.UNKNOWN, None, "DOM sources do not establish a consistent value"
                )
            dom_value = values[0]
            expected = criterion.expected_value
            return result(
                CriterionStatus.PASS if dom_value == expected else CriterionStatus.FAIL,
                cast(ExpectedValue, dom_value),
                "Fresh read-only browser observation evaluated",
            )
        db = [view for view in final if view.evidence.evidence_type == EvidenceType.DATABASE_STATE]
        if not db:
            return result(
                CriterionStatus.UNKNOWN,
                None,
                "Screenshots, model text and execution success cannot prove stored state",
            )
        stores = {view.evidence.metadata.source_store_id for view in db}
        if len(stores) != 1 or None in stores:
            return result(
                CriterionStatus.UNKNOWN,
                None,
                "Persisted evidence identifies inconsistent data stores",
            )
        rows: list[dict[str, Any] | None] = []
        for view in db:
            matches = [
                row for row in view.content.get("records", []) if row.get("id") == target.record_id
            ]
            if len(matches) > 1:
                return result(CriterionStatus.UNKNOWN, None, "Record identity is ambiguous")
            rows.append(matches[0] if matches else None)
        if any(canonical_bytes(row) != canonical_bytes(rows[0]) for row in rows):
            return result(
                CriterionStatus.UNKNOWN,
                None,
                "Fresh persisted snapshots disagree; concurrent state change is possible",
            )
        row = rows[0]
        if target.field == "inventory_digest":
            baseline = [
                view
                for view in relevant
                if view.evidence.metadata.role == "baseline"
                and view.evidence.evidence_type == EvidenceType.DATABASE_STATE
                and view.evidence.metadata.source_store_id in stores
            ]
            if not baseline:
                return result(
                    CriterionStatus.UNKNOWN,
                    None,
                    "No intact pre-execution baseline proves unrelated record state",
                )
            snapshots = [
                content_hash(
                    canonical_bytes(
                        sorted(
                            [
                                r
                                for r in view.content.get("records", [])
                                if r.get("id") != target.record_id
                            ],
                            key=lambda r: r["id"],
                        )
                    )
                )
                for view in db
            ]
            if any(value != snapshots[0] for value in snapshots):
                return result(
                    CriterionStatus.UNKNOWN, None, "Unrelated inventory changed during verification"
                )
            value: ExpectedValue = snapshots[0]
        else:
            value = cast(ExpectedValue, row.get(target.field) if row else None)
        if kind in {AssertionType.EXISTS, AssertionType.NOT_EXISTS}:
            exists = row is not None and (target.field == "id" or value is not None)
            passed = exists if kind == AssertionType.EXISTS else not exists
            return result(
                CriterionStatus.PASS if passed else CriterionStatus.FAIL,
                exists,
                "Record/field existence established by read-only database snapshots",
            )
        if kind == AssertionType.STATE_TRANSITION:
            baseline = [
                view
                for view in relevant
                if view.evidence.metadata.role == "baseline"
                and view.evidence.evidence_type == EvidenceType.DATABASE_STATE
                and view.evidence.metadata.source_store_id in stores
            ]
            if not baseline:
                return result(
                    CriterionStatus.UNKNOWN,
                    None,
                    "No trustworthy pre-execution baseline is available",
                )
            old_rows = [
                r for r in baseline[0].content.get("records", []) if r.get("id") == target.record_id
            ]
            if len(old_rows) != 1 or row is None or not isinstance(criterion.expected_value, dict):
                return result(
                    CriterionStatus.UNKNOWN,
                    None,
                    "Transition requires both identified record states",
                )
            previous = old_rows[0]
            observed = {"before": previous.get(target.field), "after": value}
            passed = canonical_bytes(observed) == canonical_bytes(
                criterion.expected_value
            ) and row.get("version", 0) > previous.get("version", 0)
            return result(
                CriterionStatus.PASS if passed else CriterionStatus.FAIL,
                observed,
                "Transition and record version compared; causal attribution is not inferred",
            )
        if kind == AssertionType.RECORD_PERSISTED:
            if len({view.evidence.metadata.nonce for view in db}) < 2:
                return result(
                    CriterionStatus.UNKNOWN,
                    None,
                    "Persistence requires two independent fresh database reads",
                )
            passed = row is not None and canonical_bytes(value) == canonical_bytes(
                criterion.expected_value
            )
            return result(
                CriterionStatus.PASS if passed else CriterionStatus.FAIL,
                value,
                "Two read-only SQLite snapshots agree on record identity, version and value",
            )
        if kind == AssertionType.CONTAINS:
            passed = (
                isinstance(value, str)
                and isinstance(criterion.expected_value, str)
                and criterion.expected_value in value
            )
        else:
            equal = canonical_bytes(value) == canonical_bytes(criterion.expected_value)
            passed = not equal if kind == AssertionType.NOT_EQUALS else equal
        return result(
            CriterionStatus.PASS if passed else CriterionStatus.FAIL,
            value,
            "Deterministic assertion against fresh persisted state",
        )
