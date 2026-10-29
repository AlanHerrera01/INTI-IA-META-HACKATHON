"""Authorized execution contracts; no browser/framework dependencies."""

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field, replace
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from inti.domain.exceptions import IntiError
from inti.domain.planning import (
    ActionParameters,
    BoundingBox,
    PlannedActionType,
    PlanningResult,
    RiskLevel,
    Viewport,
    aware,
)


class ExecutionError(IntiError):
    status_code = 409

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class OperatorRequired(IntiError):
    status_code = 401


class ExecutionStatus(StrEnum):
    CREATED = "CREATED"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    READY = "READY"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    RECOVERING = "RECOVERING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMED_OUT = "TIMED_OUT"


TERMINAL = {
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.CANCELLED,
    ExecutionStatus.TIMED_OUT,
}
TRANSITIONS = {
    ExecutionStatus.CREATED: {ExecutionStatus.AWAITING_APPROVAL, ExecutionStatus.CANCELLED},
    ExecutionStatus.AWAITING_APPROVAL: {ExecutionStatus.READY, ExecutionStatus.CANCELLED},
    ExecutionStatus.READY: {
        ExecutionStatus.RUNNING,
        ExecutionStatus.CANCELLED,
        ExecutionStatus.FAILED,
    },
    ExecutionStatus.RUNNING: {ExecutionStatus.PAUSED, ExecutionStatus.RECOVERING, *TERMINAL},
    ExecutionStatus.RECOVERING: {ExecutionStatus.RUNNING, *TERMINAL},
    ExecutionStatus.PAUSED: {
        ExecutionStatus.RUNNING,
        ExecutionStatus.CANCELLED,
        ExecutionStatus.FAILED,
        ExecutionStatus.TIMED_OUT,
    },
}


class GroundingMode(StrEnum):
    VISUAL_ONLY = "visual_only"
    HYBRID_DOM = "hybrid_dom"
    SELECTOR_BASED = "selector_based"


class AuthorizationStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"


class CheckKind(StrEnum):
    VISIBLE = "visible"
    NOT_VISIBLE = "not_visible"
    ENABLED = "enabled"
    INPUT_VALUE = "input_value"
    SELECTED_OPTION = "selected_option"
    TEXT = "text"
    URL = "url"


@dataclass(frozen=True)
class BrowserTarget:
    role: str
    name: str
    selector: str | None = None

    def __post_init__(self) -> None:
        if self.role not in {
            "button",
            "textbox",
            "combobox",
            "checkbox",
            "link",
            "text",
            "table",
            "dialog",
            "navigation",
        }:
            raise ValueError("Unsupported accessible role")
        if not self.name.strip() or len(self.name) > 300:
            raise ValueError("An exact accessible name is required")
        if self.selector is not None and not re.fullmatch(
            r'\[data-testid="[A-Za-z0-9_-]{1,100}"\]', self.selector
        ):
            raise ValueError("Only explicit data-testid selectors are supported")


@dataclass(frozen=True)
class TargetQuery:
    id: str
    target: BrowserTarget


@dataclass(frozen=True)
class BrowserCheck:
    kind: CheckKind
    target: BrowserTarget | None
    expected: str | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.kind, CheckKind):
            raise ValueError("Unsupported check")
        if self.kind != CheckKind.URL and self.target is None:
            raise ValueError("A check target is required")
        if self.kind in {
            CheckKind.INPUT_VALUE,
            CheckKind.SELECTED_OPTION,
            CheckKind.TEXT,
            CheckKind.URL,
        }:
            if self.expected is None or len(self.expected) > 2000:
                raise ValueError("Check expected value required (maximum 2000)")


@dataclass(frozen=True)
class ActionContract:
    planned_action_id: str
    target: BrowserTarget | None
    preconditions: tuple[BrowserCheck, ...]
    postconditions: tuple[BrowserCheck, ...]

    def __post_init__(self) -> None:
        if not self.preconditions or not self.postconditions:
            raise ValueError("Typed preconditions and postconditions are mandatory")
        if len(self.preconditions) > 10 or len(self.postconditions) > 10:
            raise ValueError("Too many assertions")


@dataclass(frozen=True)
class ExecutableAction:
    id: UUID
    planned_action_id: str
    action_type: PlannedActionType
    target: BrowserTarget | None
    parameters: ActionParameters
    preconditions: tuple[BrowserCheck, ...]
    expected_postconditions: tuple[BrowserCheck, ...]
    risk_level: RiskLevel
    authorization_status: AuthorizationStatus = AuthorizationStatus.PENDING

    def __post_init__(self) -> None:
        if (
            not isinstance(self.action_type, PlannedActionType)
            or not isinstance(self.risk_level, RiskLevel)
            or not isinstance(self.authorization_status, AuthorizationStatus)
        ):
            raise ValueError("Invalid executable action enum")
        ActionContract(
            self.planned_action_id, self.target, self.preconditions, self.expected_postconditions
        )
        required = {
            PlannedActionType.TYPE_TEXT: self.parameters.text,
            PlannedActionType.SELECT_OPTION: self.parameters.option,
            PlannedActionType.NAVIGATE: self.parameters.url,
            PlannedActionType.WAIT: self.parameters.seconds,
            PlannedActionType.SCROLL: self.parameters.direction,
        }
        if self.action_type in required and required[self.action_type] is None:
            raise ValueError("Required action parameter missing")
        if self.target is None and self.action_type not in {
            PlannedActionType.NAVIGATE,
            PlannedActionType.WAIT,
            PlannedActionType.SCROLL,
        }:
            raise ValueError("An executable control action requires an approved target")
        allowed = {
            PlannedActionType.CLICK: set(),
            PlannedActionType.TYPE_TEXT: {"text"},
            PlannedActionType.SELECT_OPTION: {"option"},
            PlannedActionType.NAVIGATE: {"url"},
            PlannedActionType.SCROLL: {"direction", "amount"},
            PlannedActionType.WAIT: {"seconds"},
            PlannedActionType.INSPECT: {"evidence"},
            PlannedActionType.VERIFY: {"evidence"},
        }
        if any(
            value is not None and key not in allowed[self.action_type]
            for key, value in asdict(self.parameters).items()
        ):
            raise ValueError("Parameter is not allowed for this executable action")
        if self.action_type == PlannedActionType.SCROLL and self.parameters.amount is None:
            raise ValueError("Scroll amount is required")
        if (
            self.action_type in {PlannedActionType.INSPECT, PlannedActionType.VERIFY}
            and not self.parameters.evidence
        ):
            raise ValueError("An evidence criterion is required")


@dataclass(frozen=True)
class ExecutionLimits:
    max_actions: int = 30
    max_duration_seconds: float = 180
    action_timeout_seconds: float = 10
    max_navigation_count: int = 3

    def __post_init__(self) -> None:
        if not 1 <= self.max_actions <= 50 or not 1 <= self.max_duration_seconds <= 600:
            raise ValueError("Invalid execution limits")
        if not 0.1 <= self.action_timeout_seconds <= 60 or not 1 <= self.max_navigation_count <= 10:
            raise ValueError("Invalid action limits")


@dataclass(frozen=True)
class ExecutionManifest:
    plan_snapshot: PlanningResult
    plan_digest: str
    initial_url: str
    viewport: Viewport
    grounding_mode: GroundingMode
    actions: tuple[ExecutableAction, ...]
    limits: ExecutionLimits
    digest: str = ""


def fingerprint(value: Any) -> str:
    def canonical(item: Any) -> Any:
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, dict):
            return {key: canonical(child) for key, child in item.items()}
        if isinstance(item, (list, tuple)):
            return [canonical(child) for child in item]
        return item

    return hashlib.sha256(
        json.dumps(
            canonical(asdict(value)),
            sort_keys=True,
            default=str,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


@dataclass(frozen=True)
class ExecutionSession:
    task_id: UUID
    plan_id: UUID
    status: ExecutionStatus = ExecutionStatus.CREATED
    id: UUID = field(default_factory=uuid4)
    browser_session_id: UUID | None = None
    current_action_index: int = 0
    started_at: datetime | None = None
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    error_summary: str | None = None
    error_code: str | None = None
    version: int = 0
    pause_requested: bool = False
    latest_observation_id: UUID | None = None
    overall_goal_verified: bool = False

    def __post_init__(self) -> None:
        aware(self.updated_at)
        if (
            not isinstance(self.status, ExecutionStatus)
            or self.current_action_index < 0
            or self.version < 0
        ):
            raise ValueError("Invalid execution state")
        if self.overall_goal_verified:
            raise ValueError("Phase 3 does not certify overall goals")

    def change(self, **values: Any) -> "ExecutionSession":
        if "status" in values:
            raise ValueError("Use transition() for execution state changes")
        return replace(self, **values, version=self.version + 1, updated_at=datetime.now(UTC))

    def transition(
        self, target: ExecutionStatus, code: str | None = None, message: str | None = None
    ) -> "ExecutionSession":
        if target not in TRANSITIONS.get(self.status, set()):
            raise ExecutionError(
                "INVALID_TRANSITION", f"Cannot transition {self.status} to {target}"
            )
        values: dict[str, Any] = {"status": target, "error_code": code, "error_summary": message}
        if target == ExecutionStatus.RUNNING and self.started_at is None:
            values["started_at"] = datetime.now(UTC)
        if target in TERMINAL:
            values["completed_at"] = datetime.now(UTC)
            values["pause_requested"] = False
        return replace(self, **values, version=self.version + 1, updated_at=datetime.now(UTC))


@dataclass(frozen=True)
class AuthorizationDecision:
    action_id: UUID
    decision: AuthorizationStatus
    reason: str
    approved_by: str
    approved_at: datetime
    manifest_digest: str
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        aware(self.approved_at)
        if not isinstance(self.decision, AuthorizationStatus) or not self.approved_by.strip():
            raise ValueError("Invalid authorization decision")


@dataclass(frozen=True)
class BrowserSession:
    id: UUID
    execution_id: UUID
    initial_url: str
    current_url: str
    viewport: Viewport
    created_at: datetime
    last_activity_at: datetime
    status: str
    navigation_count: int = 0


@dataclass(frozen=True)
class ResolvedTarget:
    method: str
    mode: GroundingMode
    target: BrowserTarget | None
    bounding_box: BoundingBox | None
    observation_id: UUID
    screenshot_digest: str


@dataclass(frozen=True)
class ActionExecutionResult:
    action_id: UUID
    execution_id: UUID
    status: str
    started_at: datetime
    completed_at: datetime | None = None
    duration_ms: float | None = None
    error_code: str | None = None
    error_message: str | None = None
    before_observation_id: UUID | None = None
    after_observation_id: UUID | None = None
    resolution: ResolvedTarget | None = None
    action_executed: bool = False
    postconditions_satisfied: bool | None = None
    may_have_executed: bool = False


@dataclass(frozen=True)
class ActionDispatchOutcome:
    resolution: ResolvedTarget | None
    action_executed: bool
    postconditions_satisfied: bool | None
    error_code: str | None = None
    error_message: str | None = None
    may_have_executed: bool = False


@dataclass(frozen=True)
class ExecutionEvent:
    execution_id: UUID
    event_type: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    payload: dict[str, str | int | float | bool | None] = field(default_factory=dict)
    id: UUID = field(default_factory=uuid4)
    sequence: int = 0


@dataclass(frozen=True)
class ExecutionBundle:
    session: ExecutionSession
    manifest: ExecutionManifest
    decisions: tuple[AuthorizationDecision, ...] = ()
    results: tuple[ActionExecutionResult, ...] = ()
    browser_session: BrowserSession | None = None
    plan_approved: bool = False
