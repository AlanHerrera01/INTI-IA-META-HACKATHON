from dataclasses import replace
from datetime import UTC, datetime
from uuid import uuid4

from inti.domain.execution import (
    ActionContract,
    AuthorizationStatus,
    ExecutableAction,
    ExecutionBundle,
    ExecutionError,
    ExecutionLimits,
    ExecutionManifest,
    GroundingMode,
    fingerprint,
)
from inti.domain.planning import (
    ElementType,
    PlannedActionType,
    PlanningResult,
    PlanStatus,
    RiskLevel,
)
from inti.domain.planning_policy import PlanningPolicy, risk_for

DEFERRED = {
    "unresolved_target",
    "observation_checkpoint",
    "stale_target",
    "unverified_option",
    "ungrounded_target",
    "low_confidence",
    "disabled_target",
}


class ExecutionPolicy:
    def __init__(
        self,
        planning: PlanningPolicy,
        allowed_urls: tuple[str, ...],
        limits: ExecutionLimits,
        freshness_seconds: int = 900,
    ) -> None:
        self.planning, self.allowed_urls = planning, allowed_urls
        self.limits, self.freshness_seconds = limits, freshness_seconds

    def fresh(self, result: PlanningResult) -> None:
        oldest = min(result.plan.created_at, result.scene.captured_at or result.scene.generated_at)
        if (datetime.now(UTC) - oldest).total_seconds() > self.freshness_seconds:
            raise ExecutionError("PLAN_EXPIRED", "Capture fresh evidence and prepare a new plan")

    def prepare(
        self,
        result: PlanningResult,
        contracts: tuple[ActionContract, ...],
        initial_url: str,
        mode: GroundingMode,
    ) -> ExecutionManifest:
        self.fresh(result)
        if initial_url not in self.allowed_urls:
            raise ExecutionError("URL_DENIED", "Initial URL is not an authorized demo URL")
        if result.plan.status not in {PlanStatus.VALID, PlanStatus.REQUIRES_CLARIFICATION}:
            raise ExecutionError("PLAN_NOT_VALID", "Only validated plans can be prepared")
        validation = self.planning.validate(result.plan, result.scene, result.intent)
        if (
            result.intent.ambiguities
            or result.intent.assumptions
            or result.intent.unverified_inferences
            or result.scene.uncertainties
        ):
            raise ExecutionError(
                "BUSINESS_CLARIFICATION", "Resolve business or scene ambiguity first"
            )
        if any(
            f.severity == "error" or (f.severity == "clarification" and f.code not in DEFERRED)
            for f in validation.validation_results
        ):
            raise ExecutionError(
                "PLAN_NOT_VALID", "Plan failed deterministic execution preparation"
            )
        if not 1 <= len(result.plan.actions) <= self.limits.max_actions:
            raise ExecutionError("ACTION_LIMIT", "Invalid number of executable actions")
        by_id = {contract.planned_action_id: contract for contract in contracts}
        if len(by_id) != len(contracts) or set(by_id) != {a.id for a in result.plan.actions}:
            raise ExecutionError("CONTRACT_REQUIRED", "Every action needs one exact typed contract")
        elements = {e.id: e for e in result.scene.elements}
        actions = []
        for action in validation.actions:
            contract = by_id[action.id]
            target = contract.target
            if (
                action.action_type
                not in {
                    PlannedActionType.NAVIGATE,
                    PlannedActionType.WAIT,
                    PlannedActionType.SCROLL,
                }
                and target is None
            ):
                raise ExecutionError("TARGET_UNRESOLVED", "An approved target binding is required")
            if target and action.target.element_id:
                element = elements[action.target.element_id]
                roles = {
                    ElementType.INPUT: "textbox",
                    ElementType.DROPDOWN: "combobox",
                    ElementType.MODAL: "dialog",
                }
                if target.name != element.label or target.role != roles.get(
                    element.element_type, element.element_type.value
                ):
                    raise ExecutionError(
                        "BINDING_CHANGED", "Binding differs from the grounded plan target"
                    )
            if mode == GroundingMode.SELECTOR_BASED and target and target.selector is None:
                raise ExecutionError(
                    "SELECTOR_REQUIRED", "Selector mode needs an approved data-testid"
                )
            for check in (*contract.preconditions, *contract.postconditions):
                if check.kind.value == "url" and check.expected not in self.allowed_urls:
                    raise ExecutionError(
                        "URL_DENIED", "Assertion URL is outside the demo allowlist"
                    )
            risk = max(
                (action.risk_level, risk_for(action, target.name if target else "")),
                key=list(RiskLevel).index,
            )
            if risk == RiskLevel.PROHIBITED:
                raise ExecutionError("PROHIBITED", "Prohibited actions cannot be authorized")
            actions.append(
                ExecutableAction(
                    uuid4(),
                    action.id,
                    action.action_type,
                    target,
                    action.parameters,
                    contract.preconditions,
                    contract.postconditions,
                    risk,
                )
            )
        manifest = ExecutionManifest(
            result,
            fingerprint(result),
            initial_url,
            result.scene.viewport,
            mode,
            tuple(actions),
            self.limits,
        )
        return replace(manifest, digest=fingerprint(manifest))

    def authorized(self, bundle: ExecutionBundle, current_plan: PlanningResult) -> None:
        if not bundle.plan_approved:
            raise ExecutionError("APPROVAL_REQUIRED", "Explicit plan approval is required")
        self.fresh(current_plan)
        if fingerprint(current_plan) != bundle.manifest.plan_digest:
            raise ExecutionError(
                "APPROVAL_INVALIDATED", "Plan changed; prepare and approve a new execution"
            )
        original = replace(bundle.manifest, digest="")
        if fingerprint(original) != bundle.manifest.digest:
            raise ExecutionError("APPROVAL_INVALIDATED", "Execution manifest changed")
        for action in bundle.manifest.actions:
            if not any(
                d.action_id == action.id
                and d.decision == AuthorizationStatus.APPROVED
                and d.manifest_digest == bundle.manifest.digest
                for d in bundle.decisions
            ):
                raise ExecutionError("APPROVAL_REQUIRED", "Every action needs scoped authorization")
