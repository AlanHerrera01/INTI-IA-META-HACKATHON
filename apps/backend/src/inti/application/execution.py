"""Single-worker execution orchestration with persisted CAS state and no replanning."""

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import asdict, replace
from datetime import UTC, datetime
from uuid import UUID

from inti.domain.entities import Observation
from inti.domain.exceptions import NotFoundError
from inti.domain.execution import (
    TERMINAL,
    ActionContract,
    ActionExecutionResult,
    AuthorizationDecision,
    AuthorizationStatus,
    ExecutionBundle,
    ExecutionError,
    ExecutionEvent,
    ExecutionSession,
    ExecutionStatus,
    GroundingMode,
    ResolvedTarget,
    fingerprint,
)
from inti.domain.execution_policy import ExecutionPolicy
from inti.domain.execution_ports import (
    ActionExecutorPort,
    BrowserSessionPort,
    ExecutionRepositoryPort,
)
from inti.domain.planning import RiskLevel
from inti.domain.planning_ports import PlanRepositoryPort, VisualReasoningPort
from inti.domain.ports import ArtifactStoragePort, ObservationRepositoryPort
from inti.domain.recovery_ports import RecoveryPort
from inti.domain.verification_ports import VerificationTriggerPort


class ExecutionOrchestrator:
    def __init__(
        self,
        repository: ExecutionRepositoryPort,
        plans: PlanRepositoryPort,
        observations: ObservationRepositoryPort,
        storage: ArtifactStoragePort,
        browser: BrowserSessionPort,
        executor: ActionExecutorPort,
        policy: ExecutionPolicy,
        visual: VisualReasoningPort,
        max_concurrent: int = 2,
    ) -> None:
        self.repository, self.plans, self.observations, self.storage = (
            repository,
            plans,
            observations,
            storage,
        )
        self.browser, self.executor, self.policy, self.visual = browser, executor, policy, visual
        self.tasks: dict[UUID, asyncio.Task[None]] = {}
        self.locks: dict[UUID, asyncio.Lock] = {}
        self.start_lock = asyncio.Lock()
        self.max_concurrent = max_concurrent
        self.recovery: RecoveryPort | None = None
        self.verification: VerificationTriggerPort | None = None

    def _lock(self, id: UUID) -> asyncio.Lock:
        return self.locks.setdefault(id, asyncio.Lock())

    async def get(self, id: UUID) -> ExecutionBundle:
        bundle = await self.repository.get(id)
        if bundle is None:
            raise NotFoundError("Execution not found")
        return bundle

    async def _save(
        self, previous: ExecutionBundle | None, bundle: ExecutionBundle, *events: ExecutionEvent
    ) -> None:
        await self.repository.commit(
            bundle, previous.session.version if previous else None, tuple(events)
        )
        for event in events:
            logging.getLogger("inti.execution").info(json.dumps(asdict(event), default=str))

    async def create(
        self, plan_id: UUID, contracts: tuple[ActionContract, ...], url: str, mode: GroundingMode
    ) -> ExecutionBundle:
        plan = await self.plans.get(plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")
        manifest = self.policy.prepare(plan, contracts, url, mode)
        state = ExecutionSession(plan.plan.task_id, plan_id).transition(
            ExecutionStatus.AWAITING_APPROVAL
        )
        bundle = ExecutionBundle(state, manifest)
        await self._save(
            None,
            bundle,
            ExecutionEvent(state.id, "execution_created"),
            ExecutionEvent(
                state.id, "approval_required", payload={"manifest_digest": manifest.digest}
            ),
        )
        return bundle

    async def _current(self, bundle: ExecutionBundle, require_approval: bool = True) -> None:
        current = await self.plans.get(bundle.session.plan_id)
        if current is None or fingerprint(current) != bundle.manifest.plan_digest:
            raise ExecutionError("APPROVAL_INVALIDATED", "Plan content changed or disappeared")
        self.policy.fresh(current)
        if require_approval:
            self.policy.authorized(bundle, current)

    async def approve(
        self, id: UUID, digest: str, scope: str, action_ids: tuple[UUID, ...], operator: str
    ) -> ExecutionBundle:
        async with self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status != ExecutionStatus.AWAITING_APPROVAL:
                raise ExecutionError("INVALID_TRANSITION", "Execution is not awaiting approval")
            await self._current(bundle, False)
            if digest != bundle.manifest.digest:
                await self._save(
                    bundle,
                    replace(bundle, session=bundle.session.change()),
                    ExecutionEvent(
                        id, "authorization_rejected", payload={"code": "APPROVAL_INVALIDATED"}
                    ),
                )
                raise ExecutionError(
                    "APPROVAL_INVALIDATED", "Review the exact current execution manifest"
                )
            if scope == "high_risk" and not bundle.plan_approved:
                raise ExecutionError(
                    "APPROVAL_REQUIRED", "Approve the plan before confirming high-risk actions"
                )
            if scope == "plan":
                approved = [
                    action
                    for action in bundle.manifest.actions
                    if action.risk_level != RiskLevel.HIGH
                ]
            elif scope == "high_risk" and action_ids:
                approved = [
                    action
                    for action in bundle.manifest.actions
                    if action.id in action_ids and action.risk_level == RiskLevel.HIGH
                ]
                if len(approved) != len(set(action_ids)):
                    raise ExecutionError(
                        "INVALID_APPROVAL_SCOPE", "Only exact high-risk action IDs can be confirmed"
                    )
            else:
                raise ExecutionError(
                    "INVALID_APPROVAL_SCOPE", "Choose plan or separate high-risk approval"
                )
            decisions = list(bundle.decisions)
            for action in approved:
                if not any(d.action_id == action.id for d in decisions):
                    decisions.append(
                        AuthorizationDecision(
                            action.id,
                            AuthorizationStatus.APPROVED,
                            "Separate human high-risk confirmation"
                            if scope == "high_risk"
                            else "User-approved sandbox plan",
                            operator,
                            datetime.now(UTC),
                            digest,
                        )
                    )
            updated = replace(bundle, decisions=tuple(decisions), plan_approved=True)
            all_approved = all(
                any(
                    d.action_id == action.id and d.decision == AuthorizationStatus.APPROVED
                    for d in decisions
                )
                for action in bundle.manifest.actions
            )
            state = (
                bundle.session.transition(ExecutionStatus.READY)
                if all_approved
                else bundle.session.change()
            )
            updated = replace(updated, session=state)
            await self._save(
                bundle,
                updated,
                ExecutionEvent(
                    id,
                    "plan_approved" if scope == "plan" else "high_risk_approved",
                    payload={"operator": operator},
                ),
            )
            return updated

    async def start(self, id: UUID) -> ExecutionBundle:
        async with self.start_lock, self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status != ExecutionStatus.READY:
                if bundle.session.status == ExecutionStatus.AWAITING_APPROVAL:
                    await self._save(
                        bundle,
                        replace(bundle, session=bundle.session.change()),
                        ExecutionEvent(
                            id, "authorization_rejected", payload={"code": "APPROVAL_REQUIRED"}
                        ),
                    )
                raise ExecutionError(
                    "DUPLICATE_START"
                    if bundle.session.status == ExecutionStatus.RUNNING
                    else "APPROVAL_REQUIRED",
                    "Execution must be READY before starting",
                )
            await self._current(bundle)
            if len(await self.repository.unfinished()) >= self.max_concurrent:
                raise ExecutionError("SESSION_LIMIT", "Maximum concurrent executions reached")
            if self.verification:
                try:
                    await self.verification.prepare(id)
                except Exception:
                    logging.getLogger("inti.execution").warning(
                        "verification_criteria_preparation_failed"
                    )
            updated = replace(bundle, session=bundle.session.transition(ExecutionStatus.RUNNING))
            await self._save(bundle, updated, ExecutionEvent(id, "execution_started"))
            self.tasks[id] = asyncio.create_task(self._run(id), name=f"inti-execution-{id}")
            return updated

    async def pause(self, id: UUID) -> ExecutionBundle:
        async with self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status != ExecutionStatus.RUNNING:
                raise ExecutionError("INVALID_TRANSITION", "Only RUNNING executions can pause")
            updated = replace(bundle, session=bundle.session.change(pause_requested=True))
            await self._save(bundle, updated, ExecutionEvent(id, "pause_requested"))
            return updated

    async def resume(self, id: UUID) -> ExecutionBundle:
        async with self._lock(id):
            bundle = await self.get(id)
            if (
                bundle.session.status != ExecutionStatus.PAUSED
                or bundle.session.browser_session_id is None
            ):
                raise ExecutionError(
                    "INVALID_TRANSITION", "A live paused browser session is required"
                )
            try:
                await self._current(bundle)
                info = await self.browser.info(bundle.session.browser_session_id)
                if (
                    info.current_url not in self.policy.allowed_urls
                    or info.viewport != bundle.manifest.viewport
                ):
                    raise ExecutionError("SESSION_CHANGED", "Browser URL or viewport changed")
            except ExecutionError as exc:
                updated = replace(
                    bundle,
                    session=bundle.session.transition(ExecutionStatus.FAILED, exc.code, str(exc)),
                )
                await self._save(
                    bundle,
                    updated,
                    ExecutionEvent(id, "execution_failed", payload={"code": exc.code}),
                )
                await self.browser.close_execution(id)
                raise
            updated = replace(
                bundle,
                session=bundle.session.transition(ExecutionStatus.RUNNING).change(
                    pause_requested=False
                ),
            )
            await self._save(bundle, updated, ExecutionEvent(id, "execution_resumed"))
            return updated

    async def cancel(self, id: UUID) -> ExecutionBundle:
        async with self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status in TERMINAL:
                return bundle
            updated = replace(bundle, session=bundle.session.transition(ExecutionStatus.CANCELLED))
            await self._save(bundle, updated, ExecutionEvent(id, "execution_cancelled"))
        task = self.tasks.get(id)
        if task and task is not asyncio.current_task():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        try:
            await asyncio.wait_for(self.browser.close_execution(id), timeout=5)
        except (ExecutionError, TimeoutError):
            pass  # Worker TTL is the final cleanup boundary if transport is lost.
        return await self.get(id)

    async def recover(self) -> None:
        for bundle in await self.repository.unfinished():
            updated = replace(
                bundle,
                session=bundle.session.transition(
                    ExecutionStatus.FAILED,
                    "PROCESS_RESTART",
                    "Execution process restarted; no actions were replayed",
                ),
            )
            await self._save(
                bundle,
                updated,
                ExecutionEvent(
                    bundle.session.id, "execution_failed", payload={"code": "PROCESS_RESTART"}
                ),
            )
            try:
                await self.browser.close_execution(bundle.session.id)
            except ExecutionError:
                pass

    async def shutdown(self) -> None:
        for id in tuple(self.tasks):
            await self.cancel(id)

    async def _observe(self, browser_id: UUID) -> tuple[Observation, bytes]:
        observation, data = await self.browser.observe(browser_id)
        observation = replace(observation, restricted=True)
        await self.storage.write(observation.id, data)
        try:
            await self.observations.save(observation)
        except asyncio.CancelledError:
            raise  # A thread-backed commit may finish; retain its private artifact.
        except Exception:
            await self.storage.delete(observation.id)
            raise
        return observation, data

    async def _visual_resolution(
        self, bundle: ExecutionBundle, action_index: int, observation: Observation, digest: str
    ) -> ResolvedTarget | None:
        if bundle.manifest.grounding_mode != GroundingMode.VISUAL_ONLY:
            return None
        action = bundle.manifest.actions[action_index]
        if action.target is None:
            return None
        scene = await self.visual.interpret(
            observation, f"Locate exactly {action.target.name}; do not act"
        )
        candidates = [
            e
            for e in scene.elements
            if e.label == action.target.name
            and e.visible
            and e.enabled is True
            and e.bounding_box
            and e.confidence_optional is not None
            and e.confidence_optional >= 0.6
        ]
        if len(candidates) != 1:
            raise ExecutionError(
                "TARGET_AMBIGUOUS" if len(candidates) > 1 else "TARGET_UNRESOLVED",
                "Fresh visual grounding did not identify exactly one target",
            )
        box = candidates[0].bounding_box
        assert box is not None
        return ResolvedTarget(
            "fresh_model_visual_coordinates",
            GroundingMode.VISUAL_ONLY,
            action.target,
            box.pixels(bundle.manifest.viewport),
            observation.id,
            digest,
        )

    async def _boundary(self, id: UUID) -> ExecutionBundle:
        while True:
            async with self._lock(id):
                bundle = await self.get(id)
                if bundle.session.status in TERMINAL:
                    return bundle
                if (
                    bundle.session.pause_requested
                    and bundle.session.status == ExecutionStatus.RUNNING
                ):
                    updated = replace(
                        bundle, session=bundle.session.transition(ExecutionStatus.PAUSED)
                    )
                    await self._save(bundle, updated, ExecutionEvent(id, "execution_paused"))
                    bundle = updated
                if bundle.session.status == ExecutionStatus.RUNNING:
                    return bundle
            await asyncio.sleep(0.1)

    async def _run(self, id: UUID) -> None:
        try:
            initial = await self.get(id)
            async with asyncio.timeout(initial.manifest.limits.max_duration_seconds):
                browser = await self.browser.open(
                    id,
                    initial.manifest.initial_url,
                    initial.manifest.viewport,
                    initial.manifest.limits,
                )
                async with self._lock(id):
                    bundle = await self.get(id)
                    if bundle.session.status in TERMINAL:
                        return
                    updated = replace(
                        bundle,
                        browser_session=browser,
                        session=bundle.session.change(browser_session_id=browser.id),
                    )
                    await self._save(bundle, updated, ExecutionEvent(id, "browser_session_opened"))
                while True:
                    bundle = await self._boundary(id)
                    if bundle.session.status in TERMINAL:
                        break
                    await self._current(bundle)
                    index = bundle.session.current_action_index
                    if index >= len(bundle.manifest.actions):
                        await self._finish(id, ExecutionStatus.COMPLETED)
                        break
                    action = replace(
                        bundle.manifest.actions[index],
                        authorization_status=AuthorizationStatus.APPROVED,
                    )
                    before, png = await self._observe(browser.id)
                    started = datetime.now(UTC)
                    result = ActionExecutionResult(
                        action.id, id, "RUNNING", started, before_observation_id=before.id
                    )
                    async with self._lock(id):
                        current = await self.get(id)
                        if current.session.status in TERMINAL:
                            break
                        updated = replace(
                            current,
                            results=(*current.results, result),
                            session=current.session.change(latest_observation_id=before.id),
                        )
                        await self._save(
                            current,
                            updated,
                            ExecutionEvent(
                                id,
                                "observation_captured",
                                payload={"observation_id": str(before.id), "phase": "before"},
                            ),
                            ExecutionEvent(
                                id,
                                "action_started",
                                payload={"action_id": str(action.id), "index": index},
                            ),
                        )
                    digest = hashlib.sha256(png).hexdigest()
                    resolution = await self._visual_resolution(bundle, index, before, digest)
                    tick = time.perf_counter()
                    outcome = await self.executor.execute(
                        browser.id,
                        action,
                        bundle.manifest.grounding_mode,
                        before,
                        digest,
                        resolution,
                    )
                    after: Observation | None = None
                    try:
                        after, _ = await self._observe(browser.id)
                    except Exception:
                        if outcome.error_code is None:
                            raise ExecutionError(
                                "EVIDENCE_FAILED", "Post-action screenshot could not be captured"
                            ) from None
                    complete = replace(
                        result,
                        status="SUCCEEDED" if outcome.error_code is None else "FAILED",
                        completed_at=datetime.now(UTC),
                        duration_ms=(time.perf_counter() - tick) * 1000,
                        error_code=outcome.error_code,
                        error_message=outcome.error_message,
                        after_observation_id=after.id if after else None,
                        resolution=outcome.resolution,
                        action_executed=outcome.action_executed,
                        postconditions_satisfied=outcome.postconditions_satisfied,
                        may_have_executed=outcome.may_have_executed,
                    )
                    async with self._lock(id):
                        current = await self.get(id)
                        updated = replace(
                            current,
                            results=tuple(
                                complete if r.action_id == action.id else r for r in current.results
                            ),
                            browser_session=replace(
                                current.browser_session,
                                current_url=after.source_url if after else before.source_url,
                                last_activity_at=after.timestamp if after else before.timestamp,
                            )
                            if current.browser_session
                            else None,
                            session=current.session.change(
                                current_action_index=index + (complete.status == "SUCCEEDED"),
                                latest_observation_id=after.id if after else before.id,
                            ),
                        )
                        events = [
                            ExecutionEvent(
                                id,
                                "action_completed"
                                if complete.status == "SUCCEEDED"
                                else "action_failed",
                                payload={
                                    "action_id": str(action.id),
                                    "code": complete.error_code,
                                    "postconditions_satisfied": complete.postconditions_satisfied,
                                },
                            )
                        ]
                        if after:
                            events.append(
                                ExecutionEvent(
                                    id,
                                    "observation_captured",
                                    payload={"observation_id": str(after.id), "phase": "after"},
                                )
                            )
                        await self._save(current, updated, *events)
                    if outcome.error_code:
                        if self.recovery:
                            async with self._lock(id):
                                current = await self.get(id)
                                recovering = replace(
                                    current,
                                    session=current.session.transition(ExecutionStatus.RECOVERING),
                                )
                                await self._save(
                                    current, recovering, ExecutionEvent(id, "execution_recovering")
                                )
                            recovered = await self.recovery.recover(recovering, index)
                            if recovered.recovered:
                                async with self._lock(id):
                                    current = await self.get(id)
                                    if current.session.status in TERMINAL:
                                        break
                                    resumed = replace(
                                        current,
                                        session=current.session.transition(
                                            ExecutionStatus.RUNNING
                                        ).change(
                                            current_action_index=index + 1,
                                            latest_observation_id=recovered.observation_id,
                                        ),
                                        results=tuple(
                                            replace(
                                                r,
                                                status="SATISFIED",
                                                postconditions_satisfied=True,
                                                after_observation_id=recovered.observation_id,
                                            )
                                            if r.action_id == action.id
                                            else r
                                            for r in current.results
                                        ),
                                    )
                                    await self._save(
                                        current,
                                        resumed,
                                        ExecutionEvent(
                                            id,
                                            "execution_resumed",
                                            payload={
                                                "reason": "RECOVERY_CONFIRMED_IMMEDIATE_OUTCOME"
                                            },
                                        ),
                                    )
                                continue
                            await self._finish(
                                id,
                                ExecutionStatus.CANCELLED
                                if recovered.cancelled
                                else ExecutionStatus.FAILED,
                                recovered.error_code or "RECOVERY_FAILED",
                                "Recovery stopped; original task was not resumed",
                            )
                            break
                        raise ExecutionError(
                            outcome.error_code, outcome.error_message or "Action failed"
                        )
        except asyncio.CancelledError:
            await self._finish(
                id, ExecutionStatus.CANCELLED, "EXECUTION_INTERRUPTED", "Execution was interrupted"
            )
        except TimeoutError:
            await self._finish(
                id,
                ExecutionStatus.TIMED_OUT,
                "EXECUTION_TIMEOUT",
                "Execution duration limit reached",
            )
        except Exception as exc:
            code = exc.code if isinstance(exc, ExecutionError) else "EXECUTION_FAILED"
            message = (
                str(exc)
                if isinstance(exc, ExecutionError)
                else "Execution stopped safely after a dependency failure"
            )
            await self._finish(id, ExecutionStatus.FAILED, code, message)
        finally:
            try:
                await asyncio.wait_for(self.browser.close_execution(id), timeout=5)
            except (ExecutionError, TimeoutError):
                pass
            async with self._lock(id):
                bundle = await self.get(id)
                pending = tuple(
                    replace(
                        result,
                        status="CANCELLED"
                        if bundle.session.status == ExecutionStatus.CANCELLED
                        else "FAILED",
                        completed_at=datetime.now(UTC),
                        error_code="OUTCOME_UNCERTAIN",
                        error_message="Interrupted; action will not be replayed",
                        may_have_executed=True,
                    )
                    if result.status == "RUNNING"
                    else result
                    for result in bundle.results
                )
                browser_state = (
                    replace(bundle.browser_session, status="CLOSED")
                    if bundle.browser_session
                    else None
                )
                updated = replace(
                    bundle,
                    results=pending,
                    browser_session=browser_state,
                    session=bundle.session.change(),
                )
                await self._save(bundle, updated, ExecutionEvent(id, "browser_session_closed"))
            self.tasks.pop(id, None)

    async def _finish(
        self, id: UUID, status: ExecutionStatus, code: str | None = None, message: str | None = None
    ) -> None:
        async with self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status in TERMINAL:
                return
            updated = replace(bundle, session=bundle.session.transition(status, code, message))
            event = {
                ExecutionStatus.COMPLETED: "execution_completed",
                ExecutionStatus.TIMED_OUT: "execution_failed",
            }.get(status, "execution_failed")
            await self._save(
                bundle,
                updated,
                ExecutionEvent(id, event, payload={"code": code, "overall_goal_verified": False}),
            )
        if status == ExecutionStatus.COMPLETED and self.verification:
            try:
                await self.verification.completed(id)
            except Exception:
                logging.getLogger("inti.execution").warning(
                    "independent_verification_trigger_failed"
                )
