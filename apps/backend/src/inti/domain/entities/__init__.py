from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

from inti.domain.enums import ActionType, ObservationSource, TaskStatus


@dataclass(frozen=True)
class VisionAnalysis:
    model: str
    summary: str
    elements: tuple[str, ...] = ()
    ui_state: str = ""
    response_id: str | None = None

    def __post_init__(self) -> None:
        if not self.model.strip() or not self.summary.strip():
            raise ValueError("Model and summary must be nonempty")


@dataclass(frozen=True)
class Observation:
    source_url: str
    page_title: str
    width: int
    height: int
    id: UUID = field(default_factory=uuid4)
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    source: ObservationSource = ObservationSource.BROWSER
    analysis: VisionAnalysis | None = None
    restricted: bool = False

    def __post_init__(self) -> None:
        if not self.source_url.startswith(("http://", "https://")):
            raise ValueError("Observation requires an HTTP source")
        if not 320 <= self.width <= 1920 or not 240 <= self.height <= 1080:
            raise ValueError("Viewport out of bounds")
        if self.timestamp.tzinfo is None:
            raise ValueError("Timestamp must be timezone-aware")


@dataclass
class Task:
    objective: str
    id: UUID = field(default_factory=uuid4)
    status: TaskStatus = TaskStatus.PENDING

    def __post_init__(self) -> None:
        if not self.objective.strip():
            raise ValueError("Objective must be nonempty")

    def transition(self, target: TaskStatus) -> None:
        allowed = {
            TaskStatus.PENDING: {TaskStatus.RUNNING},
            TaskStatus.RUNNING: {TaskStatus.COMPLETED, TaskStatus.FAILED},
        }
        if target not in allowed.get(self.status, set()):
            raise ValueError("Invalid task transition")
        self.status = target


@dataclass(frozen=True)
class AgentAction:
    type: ActionType
    target: str

    def __post_init__(self) -> None:
        if not self.target.strip():
            raise ValueError("Action target required")


@dataclass(frozen=True)
class ExecutionResult:
    success: bool
    detail: str

    def __post_init__(self) -> None:
        if not self.detail.strip():
            raise ValueError("Execution detail required")


@dataclass(frozen=True)
class VerificationResult:
    verified: bool
    evidence: str

    def __post_init__(self) -> None:
        if not self.evidence.strip():
            raise ValueError("Verification evidence required")
