"""Budgeted recovery coordination. Dispatch remains behind the existing action port."""

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import asdict, replace
from datetime import UTC, datetime
from uuid import UUID

from inti.application.failure_detection import FailureDetectionService
from inti.domain.entities import Observation
from inti.domain.exceptions import ConfigurationError, DependencyError, NotFoundError
from inti.domain.execution import (
    ActionExecutionResult,
    AuthorizationDecision,
    AuthorizationStatus,
    ExecutionBundle,
    ExecutionError,
    ExecutionStatus,
    fingerprint,
)
from inti.domain.execution_policy import ExecutionPolicy
from inti.domain.execution_ports import (
    ActionExecutorPort,
    BrowserSessionPort,
    ExecutionRepositoryPort,
)
from inti.domain.planning import PlannedActionType, RiskLevel
from inti.domain.planning_ports import PlanRepositoryPort
from inti.domain.ports import ArtifactStoragePort, ObservationRepositoryPort
from inti.domain.recovery import (
    R_TERMINAL,
    FailureContext,
    FailureType,
    RecoveryAttempt,
    RecoveryBudget,
    RecoveryBundle,
    RecoveryDiagnosis,
    RecoveryEvent,
    RecoveryPlan,
    RecoveryResolution,
    RecoverySession,
    RecoveryStatus,
)
from inti.domain.recovery_policy import RecoveryPolicy
from inti.domain.recovery_ports import RecoveryReasoningPort, RecoveryRepositoryPort


class RecoveryPlanner:
    def __init__(self, reasoning: RecoveryReasoningPort, policy: RecoveryPolicy) -> None:
        self.reasoning, self.policy = reasoning, policy

    async def diagnose(
        self,
        context: FailureContext,
        execution: ExecutionBundle,
        previous: Observation,
        current: Observation,
        max_tokens: int,
    ) -> RecoveryDiagnosis:
        return await self.reasoning.diagnose(context, execution, previous, current, max_tokens)

    def validate(
        self, execution: ExecutionBundle, index: int, diagnosis: RecoveryDiagnosis
    ) -> RecoveryPlan:
        return self.policy.prepare(execution, index, diagnosis)


class RecoveryOrchestrator:
    def __init__(
        self,
        repository: RecoveryRepositoryPort,
        executions: ExecutionRepositoryPort,
        plans: PlanRepositoryPort,
        observations: ObservationRepositoryPort,
        storage: ArtifactStoragePort,
        browser: BrowserSessionPort,
        executor: ActionExecutorPort,
        execution_policy: ExecutionPolicy,
        reasoning: RecoveryReasoningPort,
        budget: RecoveryBudget,
    ) -> None:
        self.repository, self.executions, self.plans = repository, executions, plans
        self.observations, self.storage, self.browser, self.executor = (
            observations,
            storage,
            browser,
            executor,
        )
        self.execution_policy, self.budget = execution_policy, budget
        self.planner = RecoveryPlanner(reasoning, RecoveryPolicy(execution_policy.allowed_urls))
        self.detector = FailureDetectionService()
        self.locks: dict[UUID, asyncio.Lock] = {}
        self.active: dict[UUID, asyncio.Task[object]] = {}
        self.deadlines: dict[UUID, float] = {}
        self.creation = asyncio.Lock()

    def _lock(self, id: UUID) -> asyncio.Lock:
        return self.locks.setdefault(id, asyncio.Lock())

    async def get(self, id: UUID) -> RecoveryBundle:
        bundle = await self.repository.get(id)
        if bundle is None:
            raise NotFoundError("Recovery not found")
        return bundle

    async def _save(
        self,
        old: RecoveryBundle | None,
        new: RecoveryBundle,
        event: str,
        **payload: str | int | float | bool | None,
    ) -> RecoveryBundle:
        item = RecoveryEvent(new.session.id, new.session.execution_id, event, payload)
        await self.repository.commit(new, old.session.version if old else None, (item,))
        logging.getLogger("inti.recovery").info(json.dumps(asdict(item), default=str))
        return new

    async def _state(
        self, id: UUID, status: RecoveryStatus, event: str, outcome: str | None = None
    ) -> RecoveryBundle:
        async with self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status == RecoveryStatus.CANCELLED:
                raise asyncio.CancelledError()
            return await self._save(
                bundle,
                replace(bundle, session=bundle.session.transition(status, outcome)),
                event,
                code=outcome,
            )

    async def _original(self, bundle: RecoveryBundle) -> ExecutionBundle:
        execution = await self.executions.get(bundle.session.execution_id)
        if execution is None or execution.session.status != ExecutionStatus.RECOVERING:
            raise ExecutionError(
                "RECOVERY_EXECUTION_INACTIVE", "Recovery cannot restart a stopped execution"
            )
        plan = await self.plans.get(execution.session.plan_id)
        if plan is None:
            raise ExecutionError("APPROVAL_INVALIDATED", "Original plan disappeared")
        self.execution_policy.authorized(execution, plan)
        return execution

    async def _fresh(self, id: UUID, browser_id: UUID) -> Observation:
        observation, png = await self.browser.observe(browser_id)
        observation = replace(observation, restricted=True)
        await self.storage.write(observation.id, png)
        try:
            await self.observations.save(observation)
        except asyncio.CancelledError:
            raise
        except Exception:
            await self.storage.delete(observation.id)
            raise
        async with self._lock(id):
            bundle = await self.get(id)
            state = bundle.session.changed(
                evidence_ids=tuple(dict.fromkeys((*bundle.session.evidence_ids, observation.id)))
            )
            await self._save(
                bundle,
                replace(
                    bundle,
                    session=state,
                    context=replace(bundle.context, current_observation_id=observation.id),
                ),
                "recovery_observation_captured",
                observation_id=str(observation.id),
            )
        return observation

    async def _escalate(self, id: UUID, code: str, retry: bool = False) -> RecoveryBundle:
        async with self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status in R_TERMINAL:
                return bundle
            state = (
                bundle.session.changed(final_outcome=code)
                if bundle.session.status == RecoveryStatus.ESCALATED
                else bundle.session.transition(RecoveryStatus.ESCALATED, code)
            ).changed(retry_allowed=retry, completed_at=None if retry else datetime.now(UTC))
            return await self._save(
                bundle, replace(bundle, session=state), "recovery_escalated", code=code
            )

    async def _permitted(self, id: UUID) -> RecoveryBundle:
        bundle = await self.get(id)
        if bundle.session.status == RecoveryStatus.CANCELLED:
            raise asyncio.CancelledError()
        if time.monotonic() >= self.deadlines.get(id, 0):
            raise ExecutionError(
                "RECOVERY_TIMEOUT", "Recovery deadline expired; retry cannot extend it"
            )
        bundle.session.check_budget()
        await self._original(bundle)
        return bundle

    async def approve(
        self, id: UUID, digest: str, scope: str, action_ids: tuple[UUID, ...], operator: str
    ) -> RecoveryBundle:
        async with self._lock(id):
            bundle = await self._permitted(id)
            if bundle.session.status != RecoveryStatus.AWAITING_APPROVAL or bundle.plan is None:
                raise ExecutionError(
                    "INVALID_RECOVERY_TRANSITION", "Recovery is not awaiting approval"
                )
            plan = bundle.plan
            self.planner.policy.authorized(plan, await self._original(bundle))
            if digest != plan.digest:
                raise ExecutionError(
                    "APPROVAL_INVALIDATED", "Review this exact recovery plan version"
                )
            if scope == "plan":
                actions = [a for a in plan.actions if a.risk_level != RiskLevel.HIGH]
            elif scope == "high_risk" and bundle.plan_approved and action_ids:
                actions = [
                    a for a in plan.actions if a.id in action_ids and a.risk_level == RiskLevel.HIGH
                ]
                if len(actions) != len(set(action_ids)):
                    raise ExecutionError(
                        "INVALID_APPROVAL_SCOPE",
                        "Only exact HIGH recovery actions can be confirmed",
                    )
            else:
                raise ExecutionError(
                    "APPROVAL_REQUIRED", "Approve the plan, then separately confirm HIGH actions"
                )
            decisions = list(bundle.decisions)
            for action in actions:
                if not any(
                    d.action_id == action.id and d.manifest_digest == digest for d in decisions
                ):
                    decisions.append(
                        AuthorizationDecision(
                            action.id,
                            AuthorizationStatus.APPROVED,
                            "Separate HIGH recovery confirmation"
                            if scope == "high_risk"
                            else "Explicit recovery plan approval",
                            operator,
                            datetime.now(UTC),
                            digest,
                        )
                    )
            ready = all(
                any(
                    d.action_id == a.id
                    and d.manifest_digest == digest
                    and d.decision == AuthorizationStatus.APPROVED
                    for d in decisions
                )
                for a in plan.actions
            )
            state = (
                bundle.session.transition(RecoveryStatus.RECOVERING)
                if ready
                else bundle.session.changed()
            )
            return await self._save(
                bundle,
                replace(bundle, session=state, decisions=tuple(decisions), plan_approved=True),
                "recovery_approved",
                operator=operator,
                scope=scope,
            )

    async def cancel(self, id: UUID) -> RecoveryBundle:
        async with self._lock(id):
            bundle = await self.get(id)
            if bundle.session.status in R_TERMINAL or (
                bundle.session.status == RecoveryStatus.ESCALATED
                and not bundle.session.retry_allowed
            ):
                return bundle
            updated = await self._save(
                bundle,
                replace(
                    bundle,
                    session=bundle.session.transition(
                        RecoveryStatus.CANCELLED, "OPERATOR_CANCELLED"
                    ),
                ),
                "recovery_cancelled",
            )
        task = self.active.get(id)
        if task and task is not asyncio.current_task():
            task.cancel()
        return updated

    async def retry(self, id: UUID) -> RecoveryBundle:
        async with self._lock(id):
            bundle = await self._permitted(id)
            if (
                bundle.session.status != RecoveryStatus.ESCALATED
                or not bundle.session.retry_allowed
                or id not in self.active
            ):
                raise ExecutionError(
                    "RECOVERY_RETRY_DENIED", "Only an active budgeted escalation can be retried"
                )
            bundle.session.check_budget(attempt=True, model=True, action=True)
            state = bundle.session.transition(RecoveryStatus.DIAGNOSING).changed(
                retry_requested=True, retry_allowed=False
            )
            return await self._save(
                bundle, replace(bundle, session=state), "recovery_retry_requested"
            )

    async def recover_interrupted(self) -> None:
        for bundle in await self.repository.unfinished():
            await self._save(
                bundle,
                replace(
                    bundle,
                    session=bundle.session.transition(RecoveryStatus.FAILED, "PROCESS_RESTART"),
                ),
                "recovery_failed",
                code="PROCESS_RESTART",
            )

    async def _wait(self, id: UUID, approval: bool) -> None:
        while True:
            bundle = await self._permitted(id)
            expected = RecoveryStatus.RECOVERING if approval else RecoveryStatus.DIAGNOSING
            if bundle.session.status == expected:
                return
            await asyncio.sleep(0.1)

    async def _verified(self, id: UUID, browser_id: UUID) -> RecoveryResolution:
        bundle = await self.get(id)
        execution = await self._original(bundle)
        action = execution.manifest.actions[execution.session.current_action_index]
        current = await self._fresh(id, browser_id)
        if not await self.browser.checks(
            browser_id, action.expected_postconditions, execution.manifest.grounding_mode
        ):
            raise ExecutionError(
                "RECOVERY_POSTCONDITION_FAILED", "Original action outcome remains unconfirmed"
            )
        await self._state(
            id, RecoveryStatus.RECOVERED, "recovery_succeeded", "IMMEDIATE_OUTCOME_CONFIRMED"
        )
        return RecoveryResolution(True, current.id)

    async def recover(self, execution: ExecutionBundle, index: int) -> RecoveryResolution:
        current_execution = await self.executions.get(execution.session.id)
        if (
            current_execution is None
            or current_execution.session.status != ExecutionStatus.RECOVERING
            or current_execution.session.current_action_index != index
            or current_execution.manifest.digest != execution.manifest.digest
        ):
            raise ExecutionError(
                "RECOVERY_EXECUTION_INACTIVE",
                "Recovery cannot restart or replace a stopped execution",
            )
        execution = current_execution
        if (
            execution.session.status != ExecutionStatus.RECOVERING
            or execution.browser_session is None
        ):
            raise ExecutionError(
                "RECOVERY_EXECUTION_INACTIVE", "A live recovering execution is required"
            )
        action = execution.manifest.actions[index]
        failed = next(r for r in reversed(execution.results) if r.action_id == action.id)
        context = self.detector.detect(execution, index, failed)
        if context is None:
            raise ExecutionError(
                "RECOVERY_CONTEXT_MISSING", "A recorded structured action failure is required"
            )
        async with self.creation:
            bundle = await self.repository.for_failure(execution.session.id, action.id)
            if bundle:
                return RecoveryResolution(
                    bundle.session.status == RecoveryStatus.RECOVERED,
                    bundle.session.evidence_ids[-1] if bundle.session.evidence_ids else None,
                    bundle.session.status == RecoveryStatus.CANCELLED,
                    "RECOVERY_ALREADY_EXISTS",
                )
            state = RecoverySession(
                execution.session.id,
                action.id,
                context.failure_type,
                self.budget,
                evidence_ids=tuple(
                    dict.fromkeys((context.previous_observation_id, context.current_observation_id))
                ),
            )
            bundle = RecoveryBundle(state, context)
            await self._save(None, bundle, "failure_detected", failure_type=context.failure_type)
        id, browser_id = bundle.session.id, execution.browser_session.id
        task = asyncio.current_task()
        if task:
            self.active[id] = task
        self.deadlines[id] = time.monotonic() + self.budget.max_duration_seconds
        try:
            async with asyncio.timeout(self.budget.max_duration_seconds):
                await self._state(id, RecoveryStatus.DIAGNOSING, "recovery_started")
                if context.failure_type in {
                    FailureType.TARGET_AMBIGUOUS,
                    FailureType.UNKNOWN,
                    FailureType.NAVIGATION_MISMATCH,
                }:
                    raise ExecutionError(
                        "RECOVERY_NEEDS_CLARIFICATION",
                        "Ambiguous, unknown or navigation failures require operator review",
                    )
                current = await self._fresh(id, browser_id)
                # Check actual postconditions before considering a potentially repeated write.
                if await self.browser.checks(
                    browser_id, action.expected_postconditions, execution.manifest.grounding_mode
                ):
                    for status, event in (
                        (RecoveryStatus.PLANNING, "strategy_selected"),
                        (RecoveryStatus.VALIDATING, "recovery_plan_generated"),
                        (RecoveryStatus.RECOVERING, "recovery_started"),
                        (RecoveryStatus.VERIFYING, "recovery_verification_started"),
                    ):
                        await self._state(id, status, event, "ALREADY_SATISFIED_NO_REPLAY")
                    return await self._verified(id, browser_id)
                if (failed.action_executed or failed.may_have_executed) and action.action_type in {
                    PlannedActionType.CLICK,
                    PlannedActionType.TYPE_TEXT,
                    PlannedActionType.SELECT_OPTION,
                    PlannedActionType.NAVIGATE,
                }:
                    raise ExecutionError(
                        "RECOVERY_OUTCOME_UNCERTAIN",
                        "A possible mutation cannot be repeated without independent confirmation",
                    )
                while True:
                    await self._permitted(id)
                    async with self._lock(id):
                        bundle = await self.get(id)
                        bundle.session.check_budget(attempt=True, model=True)
                        state = bundle.session.changed(
                            attempts_count=bundle.session.attempts_count + 1,
                            model_calls=bundle.session.model_calls + 1,
                            retry_requested=False,
                        )
                        attempt = RecoveryAttempt(
                            id,
                            state.attempts_count,
                            None,
                            datetime.now(UTC),
                            evidence_ids=(current.id,),
                        )
                        bundle = await self._save(
                            bundle,
                            replace(
                                bundle,
                                session=state,
                                attempts=(*bundle.attempts, attempt),
                                plan=None,
                                decisions=(),
                                plan_approved=False,
                            ),
                            "diagnosis_started",
                            attempt=state.attempts_count,
                        )
                    previous = await self.observations.get(context.previous_observation_id)
                    if previous is None:
                        raise ExecutionError(
                            "RECOVERY_EVIDENCE_MISSING",
                            "Previous failure observation is unavailable",
                        )
                    current = await self._fresh(id, browser_id)
                    bundle = await self.get(id)
                    token_limit = (
                        min(
                            4096,
                            bundle.session.budget.max_tokens_optional
                            - (bundle.session.tokens_used or 0),
                        )
                        if bundle.session.budget.max_tokens_optional is not None
                        else 4096
                    )
                    try:
                        diagnosis = await self.planner.diagnose(
                            bundle.context,
                            await self._original(bundle),
                            previous,
                            current,
                            token_limit,
                        )
                    except ConfigurationError:
                        raise ExecutionError(
                            "RECOVERY_MODEL_UNCONFIGURED",
                            "Meta recovery reasoning is not configured",
                        ) from None
                    except DependencyError:
                        async with self._lock(id):
                            bundle = await self.get(id)
                            state = bundle.session.changed(
                                identical_failures=bundle.session.identical_failures + 1
                            )
                            await self._save(
                                bundle,
                                replace(bundle, session=state),
                                "diagnosis_failed",
                                code="MODEL_REQUEST_FAILED",
                            )
                            state.check_budget(attempt=True, model=True)
                        await self._escalate(id, "MODEL_REQUEST_FAILED", retry=True)
                        await self._wait(id, approval=False)
                        continue
                    async with self._lock(id):
                        bundle = await self.get(id)
                        usage = diagnosis.model_usage
                        if (
                            diagnosis.evidence_ids != (previous.id, current.id)
                            or diagnosis.viewport.width != current.width
                            or diagnosis.viewport.height != current.height
                        ):
                            raise ExecutionError(
                                "RECOVERY_EVIDENCE_MISMATCH",
                                "Diagnosis does not bind to the compared fresh observations",
                            )
                        if usage and usage.retries:
                            raise ExecutionError(
                                "RECOVERY_MODEL_BUDGET_UNPROVEN",
                                "Uncounted model retries are not permitted",
                            )
                        observed_tokens = (
                            usage.input_tokens + usage.output_tokens
                            if usage
                            and usage.input_tokens is not None
                            and usage.output_tokens is not None
                            else None
                        )
                        tokens = (
                            bundle.session.tokens_used + observed_tokens
                            if bundle.session.tokens_used is not None
                            and observed_tokens is not None
                            else None
                        )
                        state = bundle.session.transition(RecoveryStatus.PLANNING).changed(
                            tokens_used=tokens
                        )
                        bundle = await self._save(
                            bundle,
                            replace(
                                bundle, session=state, diagnoses=(*bundle.diagnoses, diagnosis)
                            ),
                            "diagnosis_completed",
                        )
                        state.check_budget()
                    await self._state(id, RecoveryStatus.VALIDATING, "strategy_selected")
                    plan = self.planner.validate(await self._original(bundle), index, diagnosis)
                    async with self._lock(id):
                        bundle = await self.get(id)
                        if (
                            bundle.session.actions_used + len(plan.actions)
                            > bundle.session.budget.max_actions
                        ):
                            raise ExecutionError(
                                "RECOVERY_BUDGET_EXHAUSTED",
                                "Proposed actions exceed the remaining recovery budget",
                            )
                        attempts = (
                            *bundle.attempts[:-1],
                            replace(bundle.attempts[-1], strategy=plan.decision.selected_strategy),
                        )
                        decisions: tuple[AuthorizationDecision, ...] = ()
                        if not plan.decision.requires_approval:
                            original_decision = next(
                                d for d in execution.decisions if d.action_id == action.id
                            )
                            decisions = tuple(
                                AuthorizationDecision(
                                    a.id,
                                    AuthorizationStatus.APPROVED,
                                    "Inherited exact unchanged original action scope",
                                    original_decision.approved_by,
                                    original_decision.approved_at,
                                    plan.digest,
                                )
                                for a in plan.actions
                            )
                        bundle = await self._save(
                            bundle,
                            replace(
                                bundle,
                                session=bundle.session.changed(),
                                plan=plan,
                                attempts=attempts,
                                decisions=decisions,
                                plan_approved=not plan.decision.requires_approval,
                            ),
                            "recovery_plan_generated",
                            digest=plan.digest,
                            strategy=plan.decision.selected_strategy.strategy_type,
                        )
                    if plan.decision.requires_approval:
                        await self._state(
                            id, RecoveryStatus.AWAITING_APPROVAL, "recovery_approval_required"
                        )
                        await self._wait(id, approval=True)
                    else:
                        await self._state(id, RecoveryStatus.RECOVERING, "recovery_started")
                    failed_code = None
                    for step in plan.actions:
                        bundle = await self._permitted(id)
                        original_execution = await self._original(bundle)
                        self.planner.policy.authorized(plan, original_execution)
                        if not bundle.plan_approved or not all(
                            any(
                                d.action_id == a.id
                                and d.manifest_digest == plan.digest
                                and d.decision == AuthorizationStatus.APPROVED
                                for d in bundle.decisions
                            )
                            for a in plan.actions
                        ):
                            raise ExecutionError(
                                "APPROVAL_REQUIRED", "Recovery authorization is incomplete"
                            )
                        bundle.session.check_budget(action=True)
                        mutations = {
                            PlannedActionType.CLICK,
                            PlannedActionType.TYPE_TEXT,
                            PlannedActionType.SELECT_OPTION,
                            PlannedActionType.NAVIGATE,
                        }
                        if step.action_type in mutations:
                            historical = {
                                a.id: a
                                for attempt in bundle.attempts
                                if attempt.strategy
                                for a in attempt.strategy.required_actions
                            }
                            for past in bundle.results:
                                prior = historical.get(past.action_id)
                                if (
                                    prior
                                    and (past.action_executed or past.may_have_executed)
                                    and prior.action_type == step.action_type
                                    and prior.target == step.target
                                    and prior.parameters == step.parameters
                                ):
                                    raise ExecutionError(
                                        "RECOVERY_REPLAY_BLOCKED",
                                        "A possibly completed recovery mutation cannot be replayed",
                                    )
                        before = await self._fresh(id, browser_id)
                        started = datetime.now(UTC)
                        result = ActionExecutionResult(
                            step.id,
                            execution.session.id,
                            "RUNNING",
                            started,
                            before_observation_id=before.id,
                        )
                        async with self._lock(id):
                            bundle = await self.get(id)
                            await self._save(
                                bundle,
                                replace(
                                    bundle,
                                    session=bundle.session.changed(
                                        actions_used=bundle.session.actions_used + 1
                                    ),
                                    results=(*bundle.results, result),
                                ),
                                "recovery_action_started",
                                action_id=str(step.id),
                            )
                        png = await self.storage.read(before.id)
                        tick = time.monotonic()
                        outcome = await self.executor.execute(
                            browser_id,
                            replace(step, authorization_status=AuthorizationStatus.APPROVED),
                            execution.manifest.grounding_mode,
                            before,
                            hashlib.sha256(png).hexdigest(),
                        )
                        after = await self._fresh(id, browser_id)
                        result = replace(
                            result,
                            status="SUCCEEDED" if outcome.error_code is None else "FAILED",
                            completed_at=datetime.now(UTC),
                            duration_ms=(time.monotonic() - tick) * 1000,
                            error_code=outcome.error_code,
                            error_message=outcome.error_message,
                            after_observation_id=after.id,
                            resolution=outcome.resolution,
                            action_executed=outcome.action_executed,
                            postconditions_satisfied=outcome.postconditions_satisfied,
                            may_have_executed=outcome.may_have_executed,
                        )
                        async with self._lock(id):
                            bundle = await self.get(id)
                            await self._save(
                                bundle,
                                replace(
                                    bundle,
                                    session=bundle.session.changed(),
                                    results=(*bundle.results[:-1], result),
                                ),
                                "recovery_action_completed",
                                action_id=str(step.id),
                                code=result.error_code,
                            )
                        if outcome.error_code:
                            if (
                                outcome.action_executed or outcome.may_have_executed
                            ) and step.action_type in {
                                PlannedActionType.CLICK,
                                PlannedActionType.TYPE_TEXT,
                                PlannedActionType.SELECT_OPTION,
                                PlannedActionType.NAVIGATE,
                            }:
                                if await self.browser.checks(
                                    browser_id,
                                    action.expected_postconditions,
                                    execution.manifest.grounding_mode,
                                ):
                                    break
                                raise ExecutionError(
                                    "RECOVERY_OUTCOME_UNCERTAIN",
                                    "Possible recovery mutation will not be replayed",
                                )
                            failed_code = outcome.error_code
                            break
                    await self._state(id, RecoveryStatus.VERIFYING, "recovery_verification_started")
                    if failed_code is None:
                        verification = await self._verified(id, browser_id)
                        async with self._lock(id):
                            bundle = await self.get(id)
                            await self._save(
                                bundle,
                                replace(
                                    bundle,
                                    session=bundle.session.changed(),
                                    attempts=(
                                        *bundle.attempts[:-1],
                                        replace(
                                            bundle.attempts[-1],
                                            completed_at=datetime.now(UTC),
                                            outcome="RECOVERED",
                                            evidence_ids=bundle.session.evidence_ids,
                                        ),
                                    ),
                                ),
                                "recovery_attempt_completed",
                            )
                        return verification
                    async with self._lock(id):
                        bundle = await self.get(id)
                        signature = fingerprint(action) + ":" + failed_code
                        consecutive = (
                            bundle.session.identical_failures + 1
                            if signature == bundle.session.last_failure_fingerprint
                            else 1
                        )
                        state = bundle.session.changed(
                            identical_failures=consecutive, last_failure_fingerprint=signature
                        )
                        bundle = await self._save(
                            bundle,
                            replace(
                                bundle,
                                session=state,
                                attempts=(
                                    *bundle.attempts[:-1],
                                    replace(
                                        bundle.attempts[-1],
                                        completed_at=datetime.now(UTC),
                                        outcome="FAILED",
                                    ),
                                ),
                            ),
                            "recovery_attempt_failed",
                            code=failed_code,
                        )
                        state.check_budget(attempt=True, model=True, action=True)
                    await self._state(id, RecoveryStatus.DIAGNOSING, "diagnosis_started")
        except asyncio.CancelledError:
            bundle = await self.get(id)
            if bundle.session.status not in R_TERMINAL:
                await asyncio.shield(
                    self._state(
                        id, RecoveryStatus.CANCELLED, "recovery_cancelled", "EXECUTION_INTERRUPTED"
                    )
                )
            raise
        except TimeoutError:
            await self._escalate(id, "RECOVERY_TIMEOUT")
            return RecoveryResolution(False, error_code="RECOVERY_TIMEOUT")
        except Exception as exc:
            code = exc.code if isinstance(exc, ExecutionError) else "RECOVERY_DEPENDENCY_FAILED"
            await self._escalate(id, code)
            return RecoveryResolution(False, error_code=code)
        finally:
            try:
                async with self._lock(id):
                    final = await self.get(id)
                    final_outcome = (
                        "CANCELLED"
                        if final.session.status == RecoveryStatus.CANCELLED
                        else "ESCALATED"
                    )
                    attempts = tuple(
                        replace(a, completed_at=datetime.now(UTC), outcome=final_outcome)
                        if a.completed_at is None
                        else a
                        for a in final.attempts
                    )
                    results = tuple(
                        replace(
                            r,
                            status="CANCELLED" if final_outcome == "CANCELLED" else "FAILED",
                            completed_at=datetime.now(UTC),
                            may_have_executed=True,
                            error_code="RECOVERY_INTERRUPTED",
                            error_message="Interrupted recovery outcome is uncertain; no replay",
                        )
                        if r.status == "RUNNING"
                        else r
                        for r in final.results
                    )
                    if attempts != final.attempts or results != final.results:
                        await self._save(
                            final,
                            replace(
                                final,
                                session=final.session.changed(),
                                attempts=attempts,
                                results=results,
                            ),
                            "recovery_interruption_recorded",
                        )
            except Exception:
                logging.getLogger("inti.recovery").warning(
                    "recovery_interruption_record_unavailable"
                )
            finally:
                self.active.pop(id, None)
                self.deadlines.pop(id, None)
