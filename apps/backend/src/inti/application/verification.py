"""Independent read-only outcome verification, never task execution or remediation."""

import asyncio
import json
import logging
from dataclasses import asdict, replace
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from inti.domain.assertions import AssertionEvaluator
from inti.domain.exceptions import DependencyError, NotFoundError
from inti.domain.execution import TERMINAL, ExecutionBundle, ExecutionError, ExecutionStatus
from inti.domain.success_criteria import SuccessCriteriaEngine
from inti.domain.verification import (
    V_TERMINAL,
    BaselineReference,
    CriteriaVersion,
    Evidence,
    EvidenceMetadata,
    EvidenceType,
    SuccessCriterion,
    ValidatedEvidence,
    VerificationBundle,
    VerificationEvent,
    VerificationSession,
    VerificationStatus,
    VerificationVerdict,
    aggregate_verdict,
    canonical_bytes,
    content_hash,
)
from inti.domain.verification_ports import (
    CollectedEvidence,
    EvidenceCollectorPort,
    EvidenceIntegrityPort,
    EvidenceStoragePort,
    ExecutionEvidenceReaderPort,
    ReadOnlyApplicationStatePort,
    StateReadRequest,
    VerificationEventPublisherPort,
    VerificationRepositoryPort,
)


class IndependentVerificationOrchestrator:
    def __init__(
        self,
        repository: VerificationRepositoryPort,
        executions: ExecutionEvidenceReaderPort,
        collector: EvidenceCollectorPort,
        state: ReadOnlyApplicationStatePort,
        storage: EvidenceStoragePort,
        integrity: EvidenceIntegrityPort,
        publisher: VerificationEventPublisherPort,
        source_url: str,
        timeout_seconds: float = 30,
        auto_trigger: bool = True,
    ) -> None:
        self.repository, self.executions, self.collector = repository, executions, collector
        self.state, self.storage, self.integrity, self.publisher = (
            state,
            storage,
            integrity,
            publisher,
        )
        self.source_url, self.timeout_seconds, self.auto_trigger = (
            source_url,
            timeout_seconds,
            auto_trigger,
        )
        self.criteria_engine, self.evaluator = SuccessCriteriaEngine(), AssertionEvaluator()
        self.creation = asyncio.Lock()
        self.locks: dict[UUID, asyncio.Lock] = {}
        self.criteria_locks: dict[UUID, asyncio.Lock] = {}
        self.tasks: dict[UUID, asyncio.Task[None]] = {}

    def _lock(self, id: UUID) -> asyncio.Lock:
        return self.locks.setdefault(id, asyncio.Lock())

    async def execution(self, id: UUID) -> ExecutionBundle:
        execution = await self.executions.get(id)
        if execution is None:
            raise NotFoundError("Execution not found")
        self.criteria_engine.approved_task(execution)
        return execution

    async def get(self, id: UUID) -> VerificationBundle:
        bundle = await self.repository.get(id)
        if bundle is None:
            raise NotFoundError("Verification not found")
        return bundle

    async def _save(
        self,
        old: VerificationBundle | None,
        new: VerificationBundle,
        event: str,
        **payload: str | int | float | bool | None,
    ) -> VerificationBundle:
        item = VerificationEvent(new.session.id, new.session.execution_id, event, payload)
        await self.publisher.commit(new, old.session.version if old else None, (item,))
        logging.getLogger("inti.verification").info(
            json.dumps(
                {**asdict(item), "correlation_id": str(new.session.correlation_id)}, default=str
            )
        )
        return new

    async def _criteria(self, execution_id: UUID) -> CriteriaVersion:
        async with self.criteria_locks.setdefault(execution_id, asyncio.Lock()):
            existing = await self.repository.latest_criteria(execution_id)
            if existing:
                return existing
            execution = await self.execution(execution_id)
            criteria = self.criteria_engine.build(execution)
            # Baselines can only be acquired before actions start; never invent a post-hoc baseline.
            if (
                execution.session.status == ExecutionStatus.READY
                and execution.session.started_at is None
            ):
                request = StateReadRequest(
                    criteria.id,
                    execution_id,
                    execution.session.task_id,
                    criteria.criteria[0].target_reference.record_id,
                    uuid4(),
                )
                try:
                    snapshot = await self.state.read_snapshot(request)
                    age = (datetime.now(UTC) - snapshot.captured_at).total_seconds()
                    if not -2 <= age <= 10:
                        raise DependencyError("Pre-execution baseline is not fresh")
                    content = canonical_bytes(asdict(snapshot))
                    artifact = uuid4()
                    await self.storage.write(artifact, content)
                    reference = BaselineReference(
                        artifact,
                        content_hash(content),
                        snapshot.captured_at,
                        str(snapshot.store_id),
                        criteria.id,
                    )
                    criteria = self.criteria_engine.attach_baseline(criteria, reference, snapshot)
                except DependencyError:
                    pass  # Final verification remains evidence-driven; absent baseline is explicit.
            await self.repository.save_criteria(criteria, 0)
            return criteria

    async def prepare(self, execution_id: UUID) -> None:
        if self.auto_trigger:
            await self._criteria(execution_id)

    async def completed(self, execution_id: UUID) -> None:
        if self.auto_trigger:
            await self.create(execution_id, key="terminal")

    async def revise(
        self,
        execution_id: UUID,
        expected_version: int,
        additional: tuple[SuccessCriterion, ...],
        operator: str,
        reason: str,
    ) -> CriteriaVersion:
        async with self.criteria_locks.setdefault(execution_id, asyncio.Lock()):
            await self.execution(execution_id)
            current = await self.repository.latest_criteria(execution_id)
            if current is None or current.version != expected_version:
                raise ExecutionError(
                    "CONCURRENT_CRITERIA_UPDATE", "Review the latest approved criteria version"
                )
            try:
                updated = self.criteria_engine.append_version(current, additional, operator, reason)
            except ValueError as exc:
                raise ExecutionError(
                    "INVALID_CRITERIA_REVISION", "Criteria must remain unique and bounded"
                ) from exc
            await self.repository.save_criteria(updated, expected_version)
            return updated

    async def create(
        self, execution_id: UUID, criteria_id: UUID | None = None, key: str = "terminal"
    ) -> VerificationBundle:
        execution = await self.execution(execution_id)
        if execution.session.status not in TERMINAL or execution.session.completed_at is None:
            raise ExecutionError(
                "EXECUTION_NOT_TERMINAL", "Fresh final verification requires a stopped execution"
            )
        criteria = (
            await self.repository.criteria(criteria_id)
            if criteria_id
            else await self._criteria(execution_id)
        )
        if criteria is None:
            raise NotFoundError("Criteria version not found")
        if (
            criteria.execution_id != execution_id
            or criteria.task_id != execution.session.task_id
            or criteria.original_manifest_digest != execution.manifest.digest
            or criteria.objective != execution.manifest.plan_snapshot.plan.goal
        ):
            raise ExecutionError(
                "CRITERIA_SCOPE_CHANGED", "Criteria do not match this original approved task"
            )
        if criteria.sealed().digest != criteria.digest:
            raise ExecutionError("CRITERIA_INTEGRITY_FAILED", "Approved criteria content changed")
        async with self.creation:
            existing = await self.repository.find(execution_id, criteria.id, key)
            if existing:
                return existing
            limitations = (
                ()
                if criteria.baseline
                else ("No baseline: transition and unrelated modifications are not established",)
            )
            session = VerificationSession(
                execution.session.task_id,
                execution_id,
                criteria.id,
                key,
                limitations=limitations,
                correlation_id=execution.manifest.plan_snapshot.correlation_id,
            )
            bundle = VerificationBundle(session, criteria)
            await self._save(
                None, bundle, "verification_created", criteria_version=criteria.version
            )
            self.tasks[session.id] = asyncio.create_task(
                self._run(session.id), name=f"inti-verification-{session.id}"
            )
            return bundle

    async def cancel(self, id: UUID) -> VerificationBundle:
        async with self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status in V_TERMINAL:
                return bundle
            updated = await self._save(
                bundle,
                replace(
                    bundle,
                    session=bundle.session.transition(
                        VerificationStatus.CANCELLED, error_code="OPERATOR_CANCELLED"
                    ),
                ),
                "verification_cancelled",
            )
        task = self.tasks.get(id)
        if task and task is not asyncio.current_task():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            self.tasks.pop(id, None)
        return updated

    async def shutdown(self) -> None:
        for id in tuple(self.tasks):
            await self.cancel(id)

    async def recover_interrupted(self) -> None:
        for bundle in await self.repository.unfinished():
            status = (
                VerificationStatus.FAILED
                if bundle.session.status == VerificationStatus.CREATED
                else VerificationStatus.INCONCLUSIVE
            )
            state = bundle.session.transition(status, error_code="PROCESS_RESTART")
            await self._save(
                bundle,
                replace(bundle, session=state),
                "verification_inconclusive",
                code="PROCESS_RESTART",
            )

    async def active_for_execution(self, execution_id: UUID) -> bool:
        items, _ = await self.repository.list_verifications(0, 100, execution_id)
        return any(item.session.status not in V_TERMINAL for item in items)

    async def _record(
        self, id: UUID, item: CollectedEvidence, artifact: UUID | None = None
    ) -> Evidence:
        reference = artifact or uuid4()
        if artifact is None:
            await self.storage.write(reference, item.content)
        async with self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status in V_TERMINAL:
                raise asyncio.CancelledError()
            if len(bundle.evidence) >= 12:
                raise ExecutionError("EVIDENCE_LIMIT", "Verification evidence exceeds its bound")
            evidence = Evidence(
                id,
                item.evidence_type,
                item.source,
                item.captured_at,
                reference,
                content_hash(item.content),
                item.metadata,
            )
            state = bundle.session.changed(evidence_ids=(*bundle.session.evidence_ids, evidence.id))
            await self._save(
                bundle,
                replace(bundle, session=state, evidence=(*bundle.evidence, evidence)),
                "evidence_collected",
                evidence_id=str(evidence.id),
                evidence_type=item.evidence_type,
            )
            return evidence

    async def _baseline(self, bundle: VerificationBundle) -> None:
        baseline = bundle.criteria_version.baseline
        if baseline is None:
            return
        try:
            content = await self.storage.read(baseline.artifact_id)
            data = json.loads(content)
            request = data["request"]
            metadata = EvidenceMetadata(
                data["source_system"],
                "Pre-execution read-only SQLite baseline",
                request["record_id"],
                bundle.session.task_id,
                bundle.session.execution_id,
                bundle.session.id,
                "baseline",
                self.source_url + "verification/v1/snapshot",
                UUID(request["nonce"]),
                data["store_id"],
                "application/json",
                len(content),
            )
            item = CollectedEvidence(
                EvidenceType.DATABASE_STATE,
                "inventory-readonly-api",
                baseline.captured_at,
                content,
                metadata,
            )
            # Preserve the approved baseline hash; a modified file must fail integrity checks.
            await self._record(bundle.session.id, item, baseline.artifact_id)
            async with self._lock(bundle.session.id):
                latest = await self.get(bundle.session.id)
                last = replace(latest.evidence[-1], content_hash=baseline.content_hash)
                if last.content_hash != latest.evidence[-1].content_hash:
                    # Flag the mismatch without rewriting the immutable ledger.
                    state = latest.session.changed(
                        limitations=(*latest.session.limitations, "BASELINE_HASH_MISMATCH")
                    )
                    await self._save(
                        latest,
                        replace(latest, session=state),
                        "evidence_integrity_failed",
                        code="BASELINE_HASH_MISMATCH",
                    )
        except (NotFoundError, DependencyError, ValueError, KeyError):
            async with self._lock(bundle.session.id):
                latest = await self.get(bundle.session.id)
                await self._save(
                    latest,
                    replace(
                        latest,
                        session=latest.session.changed(
                            limitations=(
                                *latest.session.limitations,
                                "BASELINE_EVIDENCE_UNAVAILABLE",
                            )
                        ),
                    ),
                    "evidence_collection_failed",
                    code="BASELINE_EVIDENCE_UNAVAILABLE",
                )

    async def _validate(
        self, bundle: VerificationBundle, execution: ExecutionBundle
    ) -> tuple[ValidatedEvidence, ...]:
        validated = []
        for evidence in bundle.evidence:
            try:
                content = await self.storage.read(evidence.artifact_reference)
                validated.append(self.integrity.validate(evidence, content, bundle, execution))
            except (DependencyError, NotFoundError):
                validated.append(
                    ValidatedEvidence(evidence, {}, False, "EVIDENCE_ARTIFACT_UNAVAILABLE")
                )
        return tuple(validated)

    async def _run(self, id: UUID) -> None:
        try:
            async with asyncio.timeout(self.timeout_seconds):
                async with self._lock(id):
                    bundle = await self.get(id)
                    if bundle.session.status in V_TERMINAL:
                        return
                    bundle = await self._save(
                        bundle,
                        replace(
                            bundle,
                            session=bundle.session.transition(
                                VerificationStatus.COLLECTING_EVIDENCE
                            ),
                        ),
                        "evidence_collection_started",
                    )
                execution = await self.execution(bundle.session.execution_id)
                await self._baseline(bundle)
                collection = await self.collector.collect(await self.get(id), execution)
                artifacts: dict[str, UUID] = {}
                for item in collection.items:
                    digest = content_hash(item.content)
                    evidence = await self._record(id, item, artifacts.get(digest))
                    artifacts[digest] = evidence.artifact_reference
                async with self._lock(id):
                    bundle = await self.get(id)
                    state = bundle.session.transition(VerificationStatus.EVALUATING).changed(
                        limitations=(*bundle.session.limitations, *collection.failures)
                    )
                    events = tuple(
                        VerificationEvent(
                            id, execution.session.id, "evidence_collection_failed", {"code": code}
                        )
                        for code in collection.failures
                    )
                    await self.publisher.commit(
                        replace(bundle, session=state), bundle.session.version, events
                    )
                bundle = await self.get(id)
                validated = await self._validate(bundle, execution)
                for criterion in bundle.criteria_version.criteria:
                    result = self.evaluator.evaluate(criterion, validated)
                    async with self._lock(id):
                        bundle = await self.get(id)
                        await self._save(
                            bundle,
                            replace(
                                bundle,
                                session=bundle.session.changed(
                                    criteria_results=(*bundle.session.criteria_results, result)
                                ),
                            ),
                            "criterion_evaluated",
                            criterion_id=str(criterion.id),
                            status=result.status,
                        )
                async with self._lock(id):
                    bundle = await self.get(id)
                    verdict = aggregate_verdict(
                        bundle.criteria_version.criteria, bundle.session.criteria_results
                    )
                    status = (
                        VerificationStatus.INCONCLUSIVE
                        if verdict == VerificationVerdict.INCONCLUSIVE
                        else VerificationStatus.COMPLETED
                    )
                    invalid = tuple(
                        f"{view.error}:{view.evidence.id}" for view in validated if not view.valid
                    )
                    state = bundle.session.transition(status, verdict).changed(
                        limitations=(*bundle.session.limitations, *invalid)
                    )
                    await self._save(
                        bundle,
                        replace(bundle, session=state),
                        "verification_inconclusive"
                        if verdict == VerificationVerdict.INCONCLUSIVE
                        else "verification_completed",
                        verdict=verdict,
                    )
        except asyncio.CancelledError:
            bundle = await self.get(id)
            if bundle.session.status not in V_TERMINAL:
                await self._save(
                    bundle,
                    replace(
                        bundle,
                        session=bundle.session.transition(
                            VerificationStatus.CANCELLED, error_code="VERIFICATION_INTERRUPTED"
                        ),
                    ),
                    "verification_cancelled",
                )
        except Exception as exc:
            bundle = await self.get(id)
            if bundle.session.status not in V_TERMINAL:
                unavailable = isinstance(exc, (TimeoutError, DependencyError, NotFoundError))
                code = (
                    "VERIFICATION_TIMEOUT"
                    if isinstance(exc, TimeoutError)
                    else "EVIDENCE_SOURCE_UNAVAILABLE"
                    if unavailable
                    else "VERIFICATION_PROCESSING_ERROR"
                )
                status = (
                    VerificationStatus.INCONCLUSIVE if unavailable else VerificationStatus.FAILED
                )
                if bundle.session.status == VerificationStatus.CREATED:
                    status = VerificationStatus.FAILED
                await self._save(
                    bundle,
                    replace(bundle, session=bundle.session.transition(status, error_code=code)),
                    "verification_inconclusive" if unavailable else "verification_failed",
                    code=code,
                )
        finally:
            self.tasks.pop(id, None)

    async def artifact(self, id: UUID, evidence_id: UUID) -> tuple[Evidence, bytes]:
        bundle = await self.get(id)
        evidence = next((item for item in bundle.evidence if item.id == evidence_id), None)
        if evidence is None:
            raise NotFoundError("Evidence not found in this verification")
        content = await self.storage.read(evidence.artifact_reference)
        validated = self.integrity.validate(
            evidence,
            content,
            bundle,
            await self.execution(bundle.session.execution_id),
            allow_archived=True,
        )
        if not validated.valid:
            raise ExecutionError(
                "EVIDENCE_INTEGRITY_FAILED",
                "Stored evidence no longer passes provenance/integrity checks",
            )
        return evidence, content

    async def report(self, id: UUID) -> dict[str, Any]:
        bundle = await self.get(id)
        execution = await self.execution(bundle.session.execution_id)
        checks = []
        for evidence in bundle.evidence:
            try:
                content = await self.storage.read(evidence.artifact_reference)
                check = self.integrity.validate(
                    evidence, content, bundle, execution, allow_archived=True
                )
                valid = check.valid
                checks.append(
                    {
                        "evidence_id": str(evidence.id),
                        "intact": valid,
                        "error": None if valid else check.error,
                    }
                )
            except (DependencyError, NotFoundError):
                checks.append(
                    {
                        "evidence_id": str(evidence.id),
                        "intact": False,
                        "error": "ARTIFACT_UNAVAILABLE",
                    }
                )
        intact = all(check["intact"] for check in checks)
        effective = bundle.session.final_verdict if intact else VerificationVerdict.INCONCLUSIVE
        return {
            "project": "INTI AI",
            "task_id": str(bundle.session.task_id),
            "execution_id": str(execution.session.id),
            "verification_id": str(id),
            "original_objective": bundle.criteria_version.objective,
            "criteria_version": asdict(bundle.criteria_version),
            "verification": asdict(bundle.session),
            "execution_summary": {
                "status": execution.session.status,
                "declared_overall_goal_verified": execution.session.overall_goal_verified,
                "action_count": len(execution.manifest.actions),
                "actions_executed": sum(r.action_executed for r in execution.results),
                "immediate_postconditions_passed": sum(
                    r.postconditions_satisfied is True for r in execution.results
                ),
            },
            "evidence": [asdict(e) for e in bundle.evidence],
            "criteria_results": [asdict(r) for r in bundle.session.criteria_results],
            "final_verdict": bundle.session.final_verdict,
            "effective_verdict": effective,
            "integrity_checks": checks,
            "limitations": [
                *bundle.session.limitations,
                "Hashes detect content changes against stored records; storage is not tamper-proof",
                "Observed persisted state does not prove exclusive execution causality",
                "Archived evidence is evaluated against its original collection-time freshness",
            ],
        }
