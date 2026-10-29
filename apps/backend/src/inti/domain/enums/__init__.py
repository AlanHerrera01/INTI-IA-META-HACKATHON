from enum import StrEnum


class TaskStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ActionType(StrEnum):
    OBSERVE = "observe"
    CLICK = "click"
    TYPE = "type"


class ObservationSource(StrEnum):
    BROWSER = "browser"
