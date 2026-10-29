"""Deterministic, conservative planning checks. This module never executes actions."""

import re
from dataclasses import asdict, replace
from datetime import UTC, datetime

from inti.domain.planning import (
    ActionPlan,
    ElementType,
    GroundingSource,
    PlannedAction,
    PlannedActionType,
    PlanStatus,
    RiskLevel,
    TaskIntent,
    ValidationFinding,
    VisualScene,
)

# Defense in depth for the authorized inventory scope, not a universal NL safety classifier.
PROHIBITED = re.compile(
    r"javascript\s*:|\b(?:eval|exec|subprocess|powershell|cmd\.exe|bash|curl|shell|terminal|sudo|chmod|wget)\b|"
    r"document\.cookie|localStorage|os\.system|window\.location|"
    r"(?:extract|exfiltrat|steal|reveal|dump|send|upload|copy).{0,60}"
    r"(?:password|credential|secret|api.?key|token)|"
    r"\b(?:delete|destroy|wipe|drop\s+table|format\s+disk)\b|"
    r"(?:extraer|robar|enviar|revelar).{0,60}(?:contrase|credencial|secreto)|"
    r"\b(?:eliminar|borrar|destruir)\b",
    re.IGNORECASE | re.DOTALL,
)
URL_PATTERN = re.compile(r"(?:https?://|file://|ftp://)[^\s<>\"']+", re.IGNORECASE)
MUTATING = {
    PlannedActionType.CLICK,
    PlannedActionType.TYPE_TEXT,
    PlannedActionType.SELECT_OPTION,
    PlannedActionType.NAVIGATE,
}
READ_ONLY = re.compile(
    r"\b(?:inspect(?:ion)?[- ]only|read[- ]only|do not (?:change|edit|save|click|modify|update))\b|"
    r"\b(?:solo lectura|no modificar|no editar|no guardar)\b",
    re.IGNORECASE,
)


def risk_for(action: PlannedAction, label: str) -> RiskLevel:
    text = " ".join(
        filter(
            None,
            [
                label,
                action.explanation,
                action.parameters.text,
                action.parameters.option,
                action.parameters.url,
                action.target.description,
                *action.preconditions,
                *action.expected_postconditions,
            ],
        )
    )
    if PROHIBITED.search(text) or action.risk_level == RiskLevel.PROHIBITED:
        return RiskLevel.PROHIBITED
    if action.action_type == PlannedActionType.CLICK and re.search(
        r"\b(save|submit|update|purchase|pay|commit|confirm|apply|guardar|comprar)\b", label, re.I
    ):
        return RiskLevel.HIGH
    if action.action_type in MUTATING:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


class PlanningPolicy:
    def __init__(
        self,
        allowed_urls: tuple[str, ...],
        max_steps: int = 20,
        ttl_seconds: int = 900,
        min_confidence: float = 0.6,
    ) -> None:
        self.allowed_urls = allowed_urls
        self.max_steps, self.ttl_seconds = max_steps, ttl_seconds
        self.min_confidence = min_confidence

    def validate(self, plan: ActionPlan, scene: VisualScene, intent: TaskIntent) -> ActionPlan:
        findings: list[ValidationFinding] = []

        def add(
            code: str, message: str, severity: str = "error", action: str | None = None
        ) -> None:
            findings.append(ValidationFinding(code, message, severity, action))

        if plan.observation_id != scene.observation_id:
            add("observation_mismatch", "Scene does not belong to the plan observation")
        if len(plan.actions) > self.max_steps:
            add("step_limit", "Plan exceeds the configured step limit")
        if not plan.actions:
            add("empty_plan", "No actionable decomposition was provided", "clarification")
        if any(a.action_type in MUTATING for a in plan.actions) and plan.actions[
            -1
        ].action_type not in {
            PlannedActionType.INSPECT,
            PlannedActionType.VERIFY,
        }:
            add(
                "missing_final_verification",
                "Plans that propose mutations need a final evidence checkpoint",
            )
        text = " ".join(
            (
                plan.goal,
                intent.goal,
                *intent.constraints,
                intent.expected_outcome,
                *intent.explicit_requirements,
                *intent.assumptions,
                *intent.unverified_inferences,
            )
        )
        if READ_ONLY.search(" ".join((plan.goal, *intent.constraints))) and any(
            action.action_type in MUTATING for action in plan.actions
        ):
            add(
                "read_only_violation",
                "Explicit inspection/read-only constraint forbids proposed mutations",
            )
        if PROHIBITED.search(text):
            add(
                "prohibited_goal",
                "Objective requests an operation outside inventory planning policy",
            )
        for url in URL_PATTERN.findall(text):
            if url not in self.allowed_urls:
                add("external_url", "Objective contains a URL outside the exact allowlist")
        for ambiguity in intent.ambiguities:
            add("ambiguous_intent", ambiguity, "clarification")
        if intent.assumptions or intent.unverified_inferences:
            add(
                "unverified_intent",
                "Intent contains assumptions or unverified inferences",
                "clarification",
            )
        for uncertainty in scene.uncertainties:
            add("scene_uncertainty", uncertainty, "clarification")

        elements = {element.id: element for element in scene.elements}
        updated: list[PlannedAction] = []
        state_changed = False
        checkpoint = False
        for action in plan.actions:
            element = elements.get(action.target.element_id or "")
            label = element.label if element else action.target.description
            risk = risk_for(action, label)
            # Model risk declarations can increase caution, never lower it.
            levels = list(RiskLevel)
            risk = max((risk, action.risk_level), key=levels.index)
            updated.append(replace(action, risk_level=risk))
            if risk == RiskLevel.PROHIBITED:
                add("prohibited_action", "Prohibited operation", action=action.id)
            if risk == RiskLevel.HIGH:
                add(
                    "human_approval",
                    "Human approval required before any future execution",
                    "warning",
                    action.id,
                )
            if not action.preconditions or not all(p.strip() for p in action.preconditions):
                add("missing_preconditions", "Explicit preconditions required", action=action.id)
            if not action.expected_postconditions or not all(
                p.strip() for p in action.expected_postconditions
            ):
                add(
                    "missing_outcomes",
                    "Observable expected postconditions required",
                    action=action.id,
                )
            if action.action_type in {PlannedActionType.INSPECT, PlannedActionType.VERIFY}:
                if not action.parameters.evidence or not action.parameters.evidence.strip():
                    add(
                        "missing_evidence",
                        "Inspection/verification needs an evidence criterion",
                        action=action.id,
                    )
            required = {
                PlannedActionType.TYPE_TEXT: action.parameters.text,
                PlannedActionType.SELECT_OPTION: action.parameters.option,
                PlannedActionType.NAVIGATE: action.parameters.url,
                PlannedActionType.SCROLL: action.parameters.direction,
                PlannedActionType.WAIT: action.parameters.seconds,
            }
            allowed_parameters = {
                PlannedActionType.CLICK: set(),
                PlannedActionType.TYPE_TEXT: {"text"},
                PlannedActionType.SELECT_OPTION: {"option"},
                PlannedActionType.SCROLL: {"direction", "amount"},
                PlannedActionType.NAVIGATE: {"url"},
                PlannedActionType.WAIT: {"seconds"},
                PlannedActionType.INSPECT: {"evidence"},
                PlannedActionType.VERIFY: {"evidence"},
            }
            if any(
                value is not None and key not in allowed_parameters[action.action_type]
                for key, value in asdict(action.parameters).items()
            ):
                add(
                    "unsupported_parameter",
                    "Parameter is not allowed for this action",
                    action=action.id,
                )
            if action.action_type in required and not required[action.action_type]:
                add("missing_parameter", "Required action parameter missing", action=action.id)
            if action.action_type == PlannedActionType.SCROLL and action.parameters.amount is None:
                add("missing_parameter", "Scroll amount required", action=action.id)
            if action.action_type == PlannedActionType.SELECT_OPTION and action.parameters.option:
                option_visible = any(
                    item.visible
                    and item.bounding_box
                    and item.label == action.parameters.option
                    and item.element_type == ElementType.TEXT
                    for item in scene.elements
                )
                if not option_visible:
                    add(
                        "unverified_option",
                        "Dropdown option is not visible in the current scene",
                        "clarification",
                        action.id,
                    )
            if action.parameters.url and action.parameters.url not in self.allowed_urls:
                add("external_url", "Navigation URL outside exact allowlist", action=action.id)
            parameter_text = " ".join(
                filter(
                    None,
                    [
                        action.parameters.text,
                        action.parameters.option,
                        action.parameters.evidence,
                        action.explanation,
                        action.target.description,
                        *action.preconditions,
                        *action.expected_postconditions,
                    ],
                )
            )
            if PROHIBITED.search(parameter_text):
                add(
                    "prohibited_payload", "Action payload outside planning policy", action=action.id
                )
            for url in URL_PATTERN.findall(parameter_text):
                if url not in self.allowed_urls:
                    add(
                        "external_url",
                        "Action payload contains an unapproved URL",
                        action=action.id,
                    )
            if action.target.source == GroundingSource.UNRESOLVED:
                if not action.target.requires_observation:
                    add(
                        "unresolved_claim",
                        "Unresolved target must require observation",
                        action=action.id,
                    )
                if action.action_type in MUTATING and not checkpoint:
                    add(
                        "missing_checkpoint",
                        "Future interaction requires an earlier inspect checkpoint",
                        action=action.id,
                    )
                add(
                    "unresolved_target",
                    "Target requires a fresh observation before future use",
                    "clarification",
                    action.id,
                )
            elif action.target.requires_observation:
                add(
                    "observation_checkpoint",
                    "Target must be re-grounded after a fresh observation",
                    "clarification",
                    action.id,
                )
            if action.target.source != GroundingSource.UNRESOLVED and element is None:
                add(
                    "unknown_target",
                    "Target does not reference an observed element",
                    action=action.id,
                )
            elif element is not None:
                if action.target.source != element.source:
                    add(
                        "provenance_mismatch",
                        "Target provenance differs from scene",
                        action=action.id,
                    )
                if not element.visible or not element.bounding_box:
                    add(
                        "ungrounded_target",
                        "Target is not visibly grounded",
                        "clarification",
                        action.id,
                    )
                if action.action_type in MUTATING and element.enabled is not True:
                    add(
                        "disabled_target",
                        "Target is disabled or enabled state is unknown",
                        "clarification",
                        action.id,
                    )
                if (
                    element.confidence_optional is None
                    or element.confidence_optional < self.min_confidence
                ):
                    add(
                        "low_confidence",
                        "Grounding confidence missing or below threshold",
                        "clarification",
                        action.id,
                    )
                expected_type = {
                    PlannedActionType.TYPE_TEXT: ElementType.INPUT,
                    PlannedActionType.SELECT_OPTION: ElementType.DROPDOWN,
                }
                if (
                    action.action_type in expected_type
                    and element.element_type != expected_type[action.action_type]
                ):
                    add(
                        "target_type",
                        "Action incompatible with observed element type",
                        action=action.id,
                    )
                if state_changed and action.action_type in MUTATING:
                    if not action.target.requires_observation or not checkpoint:
                        add(
                            "stale_target",
                            "UI may have changed; require fresh observation and grounding",
                            "clarification",
                            action.id,
                        )
            if action.action_type == PlannedActionType.INSPECT:
                checkpoint = True
            if action.action_type in MUTATING or action.action_type == PlannedActionType.SCROLL:
                state_changed = True
                checkpoint = False

        status = PlanStatus.VALID
        if any(f.severity == "clarification" for f in findings):
            status = PlanStatus.REQUIRES_CLARIFICATION
        if any(f.severity == "error" for f in findings):
            status = PlanStatus.REJECTED
        oldest = min(plan.created_at, scene.captured_at or scene.generated_at)
        if (datetime.now(UTC) - oldest).total_seconds() > self.ttl_seconds:
            add("expired", "Observation-based plan exceeded its inspection lifetime", "warning")
            if status != PlanStatus.REJECTED:
                status = PlanStatus.EXPIRED
        return replace(
            plan, actions=tuple(updated), status=status, validation_results=tuple(findings)
        )
