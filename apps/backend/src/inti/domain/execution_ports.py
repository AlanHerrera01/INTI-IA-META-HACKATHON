from typing import Protocol
from uuid import UUID

from inti.domain.entities import Observation
from inti.domain.execution import (
    ActionDispatchOutcome,
    BrowserCheck,
    BrowserSession,
    ExecutableAction,
    ExecutionBundle,
    ExecutionEvent,
    ExecutionLimits,
    GroundingMode,
    ResolvedTarget,
    TargetQuery,
)
from inti.domain.planning import Viewport, VisualElement


class ExecutionRepositoryPort(Protocol):
    async def get(self, id: UUID) -> ExecutionBundle | None: ...
    async def commit(
        self,
        bundle: ExecutionBundle,
        expected_version: int | None,
        events: tuple[ExecutionEvent, ...],
    ) -> None: ...
    async def list_executions(
        self, offset: int, limit: int
    ) -> tuple[list[ExecutionBundle], int]: ...
    async def events(self, id: UUID, after: int = 0) -> list[ExecutionEvent]: ...
    async def unfinished(self) -> list[ExecutionBundle]: ...


class BrowserSessionPort(Protocol):
    async def checks(
        self, id: UUID, checks: tuple[BrowserCheck, ...], mode: GroundingMode
    ) -> bool: ...
    async def open(
        self, execution_id: UUID, url: str, viewport: Viewport, limits: ExecutionLimits
    ) -> BrowserSession: ...
    async def info(self, id: UUID) -> BrowserSession: ...
    async def observe(self, id: UUID) -> tuple[Observation, bytes]: ...
    async def close(self, id: UUID) -> None: ...
    async def close_execution(self, execution_id: UUID) -> None: ...
    async def catalog(
        self, id: UUID, queries: tuple["TargetQuery", ...]
    ) -> tuple["VisualElement", ...]: ...


class ActionExecutorPort(Protocol):
    async def execute(
        self,
        session_id: UUID,
        action: ExecutableAction,
        mode: GroundingMode,
        observation: Observation,
        screenshot_digest: str,
        visual_resolution: ResolvedTarget | None = None,
    ) -> ActionDispatchOutcome: ...
