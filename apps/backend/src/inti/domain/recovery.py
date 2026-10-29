"""Recovery contracts. Model proposals never grant authority."""

from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from inti.domain.execution import (
    ActionExecutionResult,
    AuthorizationDecision,
    BrowserCheck,
    BrowserTarget,
    ExecutableAction,
    ExecutionError,
    fingerprint,
)
from inti.domain.planning import BoundingBox, ModelUsage, RiskLevel, Viewport, aware, nonempty


class RecoveryStatus(StrEnum):
    DETECTED = "DETECTED"
    DIAGNOSING = "DIAGNOSING"
    PLANNING = "PLANNING"
    VALIDATING = "VALIDATING"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    RECOVERING = "RECOVERING"
    VERIFYING = "VERIFYING"
    RECOVERED = "RECOVERED"
    FAILED = "FAILED"
    ESCALATED = "ESCALATED"
    CANCELLED = "CANCELLED"


class FailureType(StrEnum):
    TARGET_NOT_FOUND = "TARGET_NOT_FOUND"
    TARGET_AMBIGUOUS = "TARGET_AMBIGUOUS"
    ELEMENT_MOVED = "ELEMENT_MOVED"
    ELEMENT_DISABLED = "ELEMENT_DISABLED"
    LABEL_CHANGED = "LABEL_CHANGED"
    MODAL_OBSTRUCTION = "MODAL_OBSTRUCTION"
    NAVIGATION_MISMATCH = "NAVIGATION_MISMATCH"
    ACTION_TIMEOUT = "ACTION_TIMEOUT"
    POSTCONDITION_FAILED = "POSTCONDITION_FAILED"
    STALE_OBSERVATION = "STALE_OBSERVATION"
    UNKNOWN = "UNKNOWN"


class StrategyType(StrEnum):
    REOBSERVE = "REOBSERVE"
    RELOCATE_TARGET = "RELOCATE_TARGET"
    REFRESH_GROUNDING = "REFRESH_GROUNDING"
    DISMISS_AUTHORIZED_MODAL = "DISMISS_AUTHORIZED_MODAL"
    WAIT_FOR_STABLE_STATE = "WAIT_FOR_STABLE_STATE"
    REPLAN_REMAINING_ACTIONS = "REPLAN_REMAINING_ACTIONS"
    REQUEST_HUMAN_APPROVAL = "REQUEST_HUMAN_APPROVAL"
    ABORT_SAFELY = "ABORT_SAFELY"


R_TERMINAL = {RecoveryStatus.RECOVERED, RecoveryStatus.FAILED, RecoveryStatus.CANCELLED}
R_TRANSITIONS = {
    RecoveryStatus.DETECTED: {RecoveryStatus.DIAGNOSING},
    RecoveryStatus.DIAGNOSING: {RecoveryStatus.PLANNING},
    RecoveryStatus.PLANNING: {RecoveryStatus.VALIDATING},
    RecoveryStatus.VALIDATING: {RecoveryStatus.RECOVERING, RecoveryStatus.AWAITING_APPROVAL},
    RecoveryStatus.AWAITING_APPROVAL: {RecoveryStatus.RECOVERING},
    RecoveryStatus.RECOVERING: {RecoveryStatus.VERIFYING},
    RecoveryStatus.VERIFYING: {
        RecoveryStatus.RECOVERED,
        RecoveryStatus.DIAGNOSING,
        RecoveryStatus.FAILED,
    },
    # Only an explicitly permitted, budgeted retry can leave escalation.
    RecoveryStatus.ESCALATED: {RecoveryStatus.DIAGNOSING},
}


@dataclass(frozen=True)
class RecoveryBudget:
    max_attempts: int = 3
    max_duration_seconds: float = 120
    max_model_calls: int = 5
    max_actions: int = 10
    max_tokens_optional: int | None = None
    max_identical_failures: int = 2

    def __post_init__(self) -> None:
        if not 1 <= self.max_attempts <= 10 or not 1 <= self.max_duration_seconds <= 600:
            raise ValueError("Invalid recovery attempt/time budget")
        if not 1 <= self.max_model_calls <= 20 or not 1 <= self.max_actions <= 30:
            raise ValueError("Invalid recovery model/action budget")
        if not 1 <= self.max_identical_failures <= 5:
            raise ValueError("Invalid identical-failure circuit breaker")
        if self.max_tokens_optional is not None and not 256 <= self.max_tokens_optional <= 100000:
            raise ValueError("Invalid optional token budget")


@dataclass(frozen=True)
class FailureContext:
    execution_id: UUID
    action_id: UUID
    failure_type: FailureType
    expected_state: tuple[BrowserCheck, ...]
    observed_state: str
    previous_observation_id: UUID
    current_observation_id: UUID
    original_target: BrowserTarget | None
    error_details: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        aware(self.timestamp)
        if not isinstance(self.failure_type, FailureType) or not self.expected_state:
            raise ValueError("Invalid classified failure")
        nonempty(self.observed_state, "Observed failure state")
        if len(self.error_details) > 2000:
            raise ValueError("Failure details exceed limit")


@dataclass(frozen=True)
class RecoveryStrategy:
    strategy_type: StrategyType
    explanation: str
    required_actions: tuple[ExecutableAction, ...]
    risk_level: RiskLevel
    confidence_optional: float | None
    expected_outcome: str
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        nonempty(self.explanation, "Strategy explanation")
        nonempty(self.expected_outcome, "Strategy outcome")
        if not isinstance(self.strategy_type, StrategyType) or not isinstance(
            self.risk_level, RiskLevel
        ):
            raise ValueError("Invalid recovery strategy enum")
        if len(self.required_actions) > 10:
            raise ValueError("Recovery plan exceeds step bound")
        if self.confidence_optional is not None and not 0 <= self.confidence_optional <= 1:
            raise ValueError("Invalid confidence")


@dataclass(frozen=True)
class RecoveryDiagnosis:
    failure_type: FailureType
    observed_facts: tuple[str, ...]
    hypotheses: tuple[str, ...]
    change_summary: str
    changed_regions: tuple[BoundingBox, ...]
    candidate_targets: tuple[BrowserTarget, ...]
    uncertainties: tuple[str, ...]
    evidence_ids: tuple[UUID, ...]
    viewport: Viewport
    strategies: tuple[RecoveryStrategy, ...]
    model_usage: ModelUsage | None = None
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if not isinstance(self.failure_type, FailureType) or not self.observed_facts:
            raise ValueError("Diagnosis must identify observations separately from hypotheses")
        nonempty(self.change_summary, "Change summary")
        if not 1 <= len(self.strategies) <= 8 or not self.evidence_ids:
            raise ValueError("Bounded strategies and evidence are required")
        if any(
            len(values) > 30
            for values in (self.observed_facts, self.hypotheses, self.uncertainties)
        ):
            raise ValueError("Diagnosis exceeds bound")
        for box in self.changed_regions:
            box.validate_viewport(self.viewport)


@dataclass(frozen=True)
class RecoveryDecision:
    selected_strategy: RecoveryStrategy
    justification: str
    assumptions: tuple[str, ...]
    uncertainties: tuple[str, ...]
    requires_approval: bool

    def __post_init__(self) -> None:
        nonempty(self.justification, "Recovery decision justification")


@dataclass(frozen=True)
class RecoveryPlan:
    objective: str
    original_manifest_digest: str
    original_action_id: UUID
    observation_id: UUID
    actions: tuple[ExecutableAction, ...]
    decision: RecoveryDecision
    digest: str = ""

    def __post_init__(self) -> None:
        nonempty(self.objective, "Recovery objective")
        if len(self.original_manifest_digest) != 64 or not self.actions:
            raise ValueError("Recovery must bind to an original approved manifest")

    def sealed(self) -> "RecoveryPlan":
        return replace(self, digest=fingerprint(replace(self, digest="")))


@dataclass(frozen=True)
class RecoveryAttempt:
    recovery_session_id: UUID
    attempt_number: int
    strategy: RecoveryStrategy | None
    started_at: datetime
    completed_at: datetime | None = None
    outcome: str = "DIAGNOSING"
    evidence_ids: tuple[UUID, ...] = ()
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        aware(self.started_at)
        if self.completed_at:
            aware(self.completed_at)
        if self.attempt_number < 1:
            raise ValueError("Attempt numbers start at one")


@dataclass(frozen=True)
class RecoverySession:
    execution_id: UUID
    failed_action_id: UUID
    initial_failure_type: FailureType
    budget: RecoveryBudget
    id: UUID = field(default_factory=uuid4)
    status: RecoveryStatus = RecoveryStatus.DETECTED
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    attempts_count: int = 0
    final_outcome: str | None = None
    evidence_ids: tuple[UUID, ...] = ()
    model_calls: int = 0
    actions_used: int = 0
    tokens_used: int | None = 0
    identical_failures: int = 0
    last_failure_fingerprint: str | None = None
    retry_allowed: bool = False
    retry_requested: bool = False
    version: int = 0

    def __post_init__(self) -> None:
        aware(self.started_at)
        if self.completed_at:
            aware(self.completed_at)
        if not isinstance(self.status, RecoveryStatus) or not isinstance(
            self.initial_failure_type, FailureType
        ):
            raise ValueError("Invalid recovery state")
        if (
            min(
                self.attempts_count,
                self.model_calls,
                self.actions_used,
                self.identical_failures,
                self.version,
            )
            < 0
        ):
            raise ValueError("Recovery counters cannot be negative")
        if self.tokens_used is not None and self.tokens_used < 0:
            raise ValueError("Token counters cannot be negative")

    def transition(self, status: RecoveryStatus, outcome: str | None = None) -> "RecoverySession":
        allowed = set(R_TRANSITIONS.get(self.status, set()))
        if self.status not in R_TERMINAL:
            allowed |= {RecoveryStatus.CANCELLED, RecoveryStatus.ESCALATED, RecoveryStatus.FAILED}
        allowed.discard(self.status)
        if status not in allowed:
            raise ExecutionError(
                "INVALID_RECOVERY_TRANSITION", f"Cannot transition {self.status} to {status}"
            )
        return replace(
            self,
            status=status,
            final_outcome=outcome,
            version=self.version + 1,
            completed_at=datetime.now(UTC)
            if status in R_TERMINAL or status == RecoveryStatus.ESCALATED
            else None,
        )

    def changed(self, **values: Any) -> "RecoverySession":
        if "status" in values:
            raise ValueError("Use transition for recovery state changes")
        return replace(self, version=self.version + 1, **values)

    def check_budget(
        self, *, attempt: bool = False, model: bool = False, action: bool = False
    ) -> None:
        budget = self.budget
        if (
            (attempt and self.attempts_count >= budget.max_attempts)
            or (model and self.model_calls >= budget.max_model_calls)
            or (action and self.actions_used >= budget.max_actions)
            or self.identical_failures >= budget.max_identical_failures
            or (
                budget.max_tokens_optional is not None
                and (self.tokens_used is None or self.tokens_used >= budget.max_tokens_optional)
            )
        ):
            raise ExecutionError(
                "RECOVERY_BUDGET_EXHAUSTED", "Recovery budget or circuit breaker reached"
            )


@dataclass(frozen=True)
class RecoveryBundle:
    session: RecoverySession
    context: FailureContext
    diagnoses: tuple[RecoveryDiagnosis, ...] = ()
    attempts: tuple[RecoveryAttempt, ...] = ()
    plan: RecoveryPlan | None = None
    decisions: tuple[AuthorizationDecision, ...] = ()
    plan_approved: bool = False
    results: tuple[ActionExecutionResult, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class RecoveryEvent:
    recovery_id: UUID
    execution_id: UUID
    event_type: str
    payload: dict[str, str | int | float | bool | None] = field(default_factory=dict)
    id: UUID = field(default_factory=uuid4)
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    sequence: int = 0


@dataclass(frozen=True)
class RecoveryResolution:
    recovered: bool
    observation_id: UUID | None = None
    cancelled: bool = False
    error_code: str | None = None
