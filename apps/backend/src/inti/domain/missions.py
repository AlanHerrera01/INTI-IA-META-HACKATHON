"""Persistent product identity. Engine records remain the source of lifecycle truth."""

from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID, uuid4

from inti.domain.planning import aware


class MissionMode(StrEnum):
    META = "meta"
    AUTHORED_DEMO = "authored_demo"


class PreparationStatus(StrEnum):
    CREATED = "CREATED"
    PREPARING = "PREPARING"
    PLAN_READY = "PLAN_READY"
    FAILED = "FAILED"


@dataclass(frozen=True)
class Mission:
    objective: str
    mode: MissionMode
    created_by: str
    id: UUID = field(default_factory=uuid4)
    target_application: str = "inventory"
    status: PreparationStatus = PreparationStatus.CREATED
    observation_id: UUID | None = None
    plan_id: UUID | None = None
    execution_id: UUID | None = None
    error_code: str | None = None
    fault_armed: bool = False
    fault_injected: bool = False
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    version: int = 0

    def __post_init__(self) -> None:
        if not 1 <= len(self.objective.strip()) <= 2000 or not self.created_by.strip():
            raise ValueError("A bounded objective and operator identity are required")
        if not isinstance(self.mode, MissionMode) or not isinstance(self.status, PreparationStatus):
            raise ValueError("Invalid mission state or planning source")
        if self.target_application != "inventory" or self.version < 0:
            raise ValueError("Only the configured synthetic inventory is supported")
        aware(self.created_at)
        aware(self.updated_at)

    def changed(self, **values: Any) -> "Mission":
        return replace(self, version=self.version + 1, updated_at=datetime.now(UTC), **values)


class MissionRepositoryPort(Protocol):
    async def get(self, id: UUID) -> Mission | None: ...
    async def for_execution(self, id: UUID) -> Mission | None: ...
    async def save(self, mission: Mission, expected_version: int | None) -> None: ...
    async def list(self, offset: int, limit: int) -> tuple[list[Mission], int]: ...


class DemoControlPort(Protocol):
    async def status(self) -> dict[str, Any]: ...
    async def reset(self, store_id: UUID) -> dict[str, Any]: ...
    async def inject(self) -> None: ...
