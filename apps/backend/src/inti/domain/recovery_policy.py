"""Conservative recovery validation independent of model confidence."""

import re
from dataclasses import asdict, replace

from inti.domain.execution import (
    AuthorizationStatus,
    BrowserCheck,
    BrowserTarget,
    CheckKind,
    ExecutionBundle,
    ExecutionError,
    GroundingMode,
    fingerprint,
)
from inti.domain.planning import PlannedActionType, RiskLevel
from inti.domain.planning_policy import PROHIBITED
from inti.domain.recovery import (
    RecoveryDecision,
    RecoveryDiagnosis,
    RecoveryPlan,
    RecoveryStrategy,
    StrategyType,
)


class RecoveryStrategySelector:
    ORDER = (
        StrategyType.REOBSERVE,
        StrategyType.REFRESH_GROUNDING,
        StrategyType.RELOCATE_TARGET,
        StrategyType.WAIT_FOR_STABLE_STATE,
        StrategyType.DISMISS_AUTHORIZED_MODAL,
        StrategyType.REPLAN_REMAINING_ACTIONS,
        StrategyType.REQUEST_HUMAN_APPROVAL,
        StrategyType.ABORT_SAFELY,
    )

    def select(self, diagnosis: RecoveryDiagnosis) -> RecoveryStrategy:
        viable = [s for s in diagnosis.strategies if s.risk_level != RiskLevel.PROHIBITED]
        if not viable:
            raise ExecutionError("RECOVERY_PROHIBITED", "No permissible strategy was proposed")
        return min(viable, key=lambda s: self.ORDER.index(s.strategy_type))


class RecoveryPolicy:
    def __init__(self, allowed_urls: tuple[str, ...]) -> None:
        self.allowed_urls = allowed_urls
        self.selector = RecoveryStrategySelector()

    def prepare(
        self, execution: ExecutionBundle, index: int, diagnosis: RecoveryDiagnosis
    ) -> RecoveryPlan:
        if execution.manifest.grounding_mode == GroundingMode.VISUAL_ONLY:
            raise ExecutionError(
                "VISUAL_RECOVERY_UNSUPPORTED", "Recovery cannot silently change grounding mode"
            )
        if diagnosis.uncertainties:
            raise ExecutionError(
                "RECOVERY_UNCERTAIN", "Resolve diagnosis uncertainty before acting"
            )
        original = execution.manifest.actions[index]
        strategy = self.selector.select(diagnosis)
        if strategy.strategy_type in {
            StrategyType.ABORT_SAFELY,
            StrategyType.REQUEST_HUMAN_APPROVAL,
        }:
            raise ExecutionError("RECOVERY_ESCALATED", strategy.explanation)
        if not strategy.required_actions:
            raise ExecutionError(
                "RECOVERY_PLAN_INVALID", "A recovery plan must include the interrupted action"
            )
        actions = list(strategy.required_actions)
        last = actions[-1]
        if last.action_type != original.action_type or last.parameters != original.parameters:
            raise ExecutionError(
                "RECOVERY_SCOPE_CHANGED", "Recovery cannot change the approved action or values"
            )
        if last.expected_postconditions != original.expected_postconditions:
            raise ExecutionError(
                "RECOVERY_SCOPE_CHANGED", "Recovery cannot weaken the approved outcome checks"
            )
        expected_guards = tuple(
            replace(check, target=last.target) if check.target == original.target else check
            for check in original.preconditions
        )
        if last.preconditions != expected_guards:
            raise ExecutionError(
                "RECOVERY_SCOPE_CHANGED", "Recovery cannot weaken original preconditions"
            )
        equivalent = (
            len(actions) == 1
            and replace(
                last,
                id=original.id,
                planned_action_id=original.planned_action_id,
                authorization_status=original.authorization_status,
            )
            == original
        )
        records = set(
            re.findall(r"\b[A-Z]{1,8}-\d{1,8}\b", execution.manifest.plan_snapshot.plan.goal)
        )
        for position, action in enumerate(actions):
            content = str(asdict(action))
            if PROHIBITED.search(content) or action.risk_level == RiskLevel.PROHIBITED:
                raise ExecutionError(
                    "RECOVERY_PROHIBITED", "Recovery contains a prohibited operation"
                )
            identifiers = set(re.findall(r"\b[A-Z]{1,8}-\d{1,8}\b", content))
            if identifiers - records:
                raise ExecutionError(
                    "RECOVERY_SCOPE_CHANGED", "Recovery mentions an unrelated record"
                )
            if (
                action.target
                and execution.manifest.grounding_mode == GroundingMode.SELECTOR_BASED
                and not action.target.selector
            ):
                raise ExecutionError(
                    "SELECTOR_REQUIRED", "Recovery needs an exact approved selector"
                )
            for check in (*action.preconditions, *action.expected_postconditions):
                if check.kind == CheckKind.URL and check.expected not in self.allowed_urls:
                    raise ExecutionError("URL_DENIED", "Recovery assertion URL is unauthorized")
            risk = max(
                (
                    action.risk_level,
                    original.risk_level if position == len(actions) - 1 else RiskLevel.LOW,
                ),
                key=list(RiskLevel).index,
            )
            if position < len(actions) - 1:
                if action.action_type not in {
                    PlannedActionType.WAIT,
                    PlannedActionType.INSPECT,
                    PlannedActionType.CLICK,
                }:
                    raise ExecutionError(
                        "RECOVERY_SCOPE_CHANGED",
                        "Only inspect, wait or reviewed modal dismissal may precede resumption",
                    )
                if action.action_type == PlannedActionType.CLICK:
                    if (
                        strategy.strategy_type != StrategyType.DISMISS_AUTHORIZED_MODAL
                        or not action.target
                        or action.target.role != "button"
                    ):
                        raise ExecutionError(
                            "RECOVERY_SCOPE_CHANGED",
                            "New clicks require a reviewed modal-dismissal strategy",
                        )
                    risk = RiskLevel.HIGH
            if (
                action.action_type == PlannedActionType.NAVIGATE
                and action.parameters.url not in self.allowed_urls
            ):
                raise ExecutionError("URL_DENIED", "Recovery destination is unauthorized")
            # An altered persistent-save binding additionally checks the intended record heading.
            checks = action.preconditions
            if not equivalent and position == len(actions) - 1 and risk == RiskLevel.HIGH:
                if len(records) != 1:
                    raise ExecutionError(
                        "RECOVERY_SCOPE_UNPROVEN", "A unique record identity is required"
                    )
                record = next(iter(records))
                heading = BrowserTarget("text", f"Asset {record}")
                checks = (*checks, BrowserCheck(CheckKind.TEXT, heading, f"Asset {record}"))
            actions[position] = replace(
                action,
                risk_level=risk,
                preconditions=checks,
                authorization_status=AuthorizationStatus.PENDING,
            )
        decision = RecoveryDecision(
            strategy,
            "Least invasive proposed strategy that passed deterministic scope validation",
            (),
            diagnosis.uncertainties,
            not equivalent,
        )
        return RecoveryPlan(
            execution.manifest.plan_snapshot.plan.goal,
            execution.manifest.digest,
            original.id,
            diagnosis.evidence_ids[-1],
            tuple(actions),
            decision,
        ).sealed()

    def authorized(self, plan: RecoveryPlan, execution: ExecutionBundle) -> None:
        if (
            plan.original_manifest_digest != execution.manifest.digest
            or plan.objective != execution.manifest.plan_snapshot.plan.goal
        ):
            raise ExecutionError(
                "APPROVAL_INVALIDATED",
                "Recovery no longer matches the original objective and approval",
            )
        if fingerprint(replace(plan, digest="")) != plan.digest:
            raise ExecutionError("APPROVAL_INVALIDATED", "Recovery plan changed after approval")
