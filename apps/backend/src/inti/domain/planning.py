"""Planning contracts. No framework imports and no action execution behavior."""

import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4


class ElementType(StrEnum):
    BUTTON = "button"
    INPUT = "input"
    CHECKBOX = "checkbox"
    DROPDOWN = "dropdown"
    LINK = "link"
    TEXT = "text"
    TABLE = "table"
    MODAL = "modal"
    NAVIGATION = "navigation"
    UNKNOWN = "unknown"


class CoordinateSystem(StrEnum):
    PIXELS = "pixels"
    NORMALIZED = "normalized_1000"


class GroundingSource(StrEnum):
    MODEL_VISUAL = "model_visual"
    DOM_ASSISTED = "dom_assisted"
    UNRESOLVED = "unresolved"


class PlannedActionType(StrEnum):
    CLICK = "click"
    TYPE_TEXT = "type_text"
    SELECT_OPTION = "select_option"
    SCROLL = "scroll"
    NAVIGATE = "navigate"
    WAIT = "wait"
    INSPECT = "inspect"
    VERIFY = "verify"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    PROHIBITED = "PROHIBITED"


class PlanStatus(StrEnum):
    DRAFT = "draft"
    VALID = "valid"
    REQUIRES_CLARIFICATION = "requires_clarification"
    REJECTED = "rejected"
    EXPIRED = "expired"


def nonempty(value: str, name: str) -> None:
    if not value.strip():
        raise ValueError(f"{name} must be nonempty")


def aware(value: datetime) -> None:
    if value.tzinfo is None:
        raise ValueError("Timestamps must be timezone-aware")


@dataclass(frozen=True)
class Viewport:
    width: int
    height: int

    def __post_init__(self) -> None:
        if not 320 <= self.width <= 1920 or not 240 <= self.height <= 1080:
            raise ValueError("Invalid viewport")


@dataclass(frozen=True)
class BoundingBox:
    x: float
    y: float
    width: float
    height: float
    coordinate_system: CoordinateSystem

    def __post_init__(self) -> None:
        values = (self.x, self.y, self.width, self.height)
        if not all(math.isfinite(v) for v in values):
            raise ValueError("Coordinates must be finite")
        if self.x < 0 or self.y < 0 or self.width <= 0 or self.height <= 0:
            raise ValueError("Invalid bounding box dimensions")
        if not isinstance(self.coordinate_system, CoordinateSystem):
            raise ValueError("Unknown coordinate system")
        if self.coordinate_system == CoordinateSystem.NORMALIZED:
            if self.x + self.width > 1000 or self.y + self.height > 1000:
                raise ValueError("Normalized box exceeds 0–1000 bounds")

    def validate_viewport(self, viewport: Viewport) -> None:
        if self.coordinate_system == CoordinateSystem.PIXELS:
            if self.x + self.width > viewport.width or self.y + self.height > viewport.height:
                raise ValueError("Pixel box exceeds viewport")

    def pixels(self, viewport: Viewport) -> "BoundingBox":
        self.validate_viewport(viewport)
        if self.coordinate_system == CoordinateSystem.PIXELS:
            return self
        return BoundingBox(
            self.x * viewport.width / 1000,
            self.y * viewport.height / 1000,
            self.width * viewport.width / 1000,
            self.height * viewport.height / 1000,
            CoordinateSystem.PIXELS,
        )


@dataclass(frozen=True)
class VisualElement:
    id: str
    element_type: ElementType
    label: str
    description: str
    bounding_box: BoundingBox | None
    visible: bool
    enabled: bool | None
    source: GroundingSource
    confidence_optional: float | None = None

    def __post_init__(self) -> None:
        nonempty(self.id, "Element id")
        nonempty(self.description, "Element description")
        if not isinstance(self.element_type, ElementType):
            raise ValueError("Unsupported element type")
        if not isinstance(self.source, GroundingSource):
            raise ValueError("Unsupported provenance")
        if self.confidence_optional is not None and not 0 <= self.confidence_optional <= 1:
            raise ValueError("Confidence must be between 0 and 1")
        if self.source == GroundingSource.UNRESOLVED and self.bounding_box is not None:
            raise ValueError("Unresolved elements cannot have grounded coordinates")
        if not self.visible and self.bounding_box is not None:
            raise ValueError("Invisible elements cannot have visible coordinates")


@dataclass(frozen=True)
class ModelUsage:
    model: str
    response_id: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    retries: int = 0

    def __post_init__(self) -> None:
        nonempty(self.model, "Model")
        nonempty(self.response_id, "Response id")
        if any(
            n is not None and n < 0 for n in (self.input_tokens, self.output_tokens, self.retries)
        ):
            raise ValueError("Usage cannot be negative")


@dataclass(frozen=True)
class VisualScene:
    observation_id: UUID
    viewport: Viewport
    elements: tuple[VisualElement, ...]
    summary: str
    uncertainties: tuple[str, ...]
    generated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    id: UUID = field(default_factory=uuid4)
    model_usage: ModelUsage | None = None
    captured_at: datetime | None = None

    def __post_init__(self) -> None:
        nonempty(self.summary, "Scene summary")
        aware(self.generated_at)
        if self.captured_at is not None:
            aware(self.captured_at)
        if len(self.elements) > 200 or len({e.id for e in self.elements}) != len(self.elements):
            raise ValueError("Scene element identifiers must be unique (maximum 200)")
        for element in self.elements:
            if element.bounding_box:
                element.bounding_box.validate_viewport(self.viewport)


@dataclass(frozen=True)
class TaskIntent:
    goal: str
    target_application: str
    constraints: tuple[str, ...]
    expected_outcome: str
    ambiguities: tuple[str, ...]
    explicit_requirements: tuple[str, ...] = ()
    assumptions: tuple[str, ...] = ()
    unverified_inferences: tuple[str, ...] = ()
    model_usage: ModelUsage | None = None

    def __post_init__(self) -> None:
        nonempty(self.goal, "Goal")
        nonempty(self.target_application, "Target application")
        if not self.expected_outcome.strip() and not self.ambiguities:
            raise ValueError("Missing outcome requires clarification")


@dataclass(frozen=True)
class ActionTarget:
    element_id: str | None
    description: str
    source: GroundingSource
    requires_observation: bool

    def __post_init__(self) -> None:
        nonempty(self.description, "Target description")
        if not isinstance(self.source, GroundingSource):
            raise ValueError("Unsupported target provenance")
        if self.source == GroundingSource.UNRESOLVED and self.element_id is not None:
            raise ValueError("An unresolved target cannot claim an observed element")
        if self.source != GroundingSource.UNRESOLVED and not self.element_id:
            raise ValueError("Grounded target requires an element reference")


@dataclass(frozen=True)
class ActionParameters:
    text: str | None = None
    option: str | None = None
    url: str | None = None
    direction: str | None = None
    amount: int | None = None
    seconds: float | None = None
    evidence: str | None = None

    def __post_init__(self) -> None:
        if self.amount is not None and not 1 <= self.amount <= 2000:
            raise ValueError("Scroll amount must be 1–2000")
        if self.seconds is not None and not 0 < self.seconds <= 30:
            raise ValueError("Wait duration must be within 30 seconds")
        if self.direction is not None and self.direction not in {"up", "down", "left", "right"}:
            raise ValueError("Unsupported scroll direction")
        if any(
            v is not None and len(v) > 2000
            for v in (
                self.text,
                self.option,
                self.url,
                self.evidence,
            )
        ):
            raise ValueError("Action parameter exceeds limit")


@dataclass(frozen=True)
class PlannedAction:
    id: str
    action_type: PlannedActionType
    target: ActionTarget
    parameters: ActionParameters
    preconditions: tuple[str, ...]
    expected_postconditions: tuple[str, ...]
    explanation: str
    risk_level: RiskLevel

    def __post_init__(self) -> None:
        nonempty(self.id, "Action id")
        nonempty(self.explanation, "Action explanation")
        if not isinstance(self.action_type, PlannedActionType):
            raise ValueError("Unsupported action type")
        if not isinstance(self.risk_level, RiskLevel):
            raise ValueError("Unsupported risk level")


@dataclass(frozen=True)
class ValidationFinding:
    code: str
    message: str
    severity: str
    action_id: str | None = None

    def __post_init__(self) -> None:
        if self.severity not in {"error", "clarification", "warning"}:
            raise ValueError("Unsupported validation severity")


@dataclass(frozen=True)
class ActionPlan:
    task_id: UUID
    observation_id: UUID
    goal: str
    actions: tuple[PlannedAction, ...]
    status: PlanStatus = PlanStatus.DRAFT
    validation_results: tuple[ValidationFinding, ...] = ()
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    model_metadata: tuple[ModelUsage, ...] = ()

    def __post_init__(self) -> None:
        nonempty(self.goal, "Plan goal")
        aware(self.created_at)
        if not isinstance(self.status, PlanStatus):
            raise ValueError("Unsupported plan status; execution is not supported")
        if len(self.actions) > 50 or len({a.id for a in self.actions}) != len(self.actions):
            raise ValueError("Action identifiers must be unique (maximum 50)")


@dataclass(frozen=True)
class PlanningResult:
    plan: ActionPlan
    scene: VisualScene
    intent: TaskIntent
    assumptions: tuple[str, ...]
    unresolved_ambiguities: tuple[str, ...]
    warnings: tuple[str, ...]
    model_usage: tuple[ModelUsage, ...]
    validation_summary: str
    started_at: datetime
    ended_at: datetime
    correlation_id: UUID

    def __post_init__(self) -> None:
        aware(self.started_at)
        aware(self.ended_at)
        if self.ended_at < self.started_at or self.plan.observation_id != self.scene.observation_id:
            raise ValueError("Inconsistent planning result")


@dataclass(frozen=True)
class PlanningEvent:
    task_id: UUID
    correlation_id: UUID
    kind: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    plan_id: UUID | None = None
    code: str | None = None
    id: UUID = field(default_factory=uuid4)
    model_usage: ModelUsage | None = None
