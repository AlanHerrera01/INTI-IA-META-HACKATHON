from typing import Protocol
from uuid import UUID

from inti.domain.entities import Observation
from inti.domain.execution import ActionExecutionResult, ExecutionBundle
from inti.domain.recovery import (
    FailureContext,
    RecoveryBundle,
    RecoveryDiagnosis,
    RecoveryEvent,
    RecoveryResolution,
)


class FailureDetectionPort(Protocol):
    def detect(
        self, bundle: ExecutionBundle, index: int, result: ActionExecutionResult
    ) -> FailureContext | None: ...


class RecoveryReasoningPort(Protocol):
    async def diagnose(
        self,
        context: FailureContext,
        execution: ExecutionBundle,
        previous: Observation,
        current: Observation,
        max_tokens: int,
    ) -> RecoveryDiagnosis: ...


class RecoveryPort(Protocol):
    async def recover(self, execution: ExecutionBundle, index: int) -> RecoveryResolution: ...


class RecoveryRepositoryPort(Protocol):
    async def get(self, id: UUID) -> RecoveryBundle | None: ...
    async def for_failure(self, execution_id: UUID, action_id: UUID) -> RecoveryBundle | None: ...
    async def commit(
        self,
        bundle: RecoveryBundle,
        expected_version: int | None,
        events: tuple[RecoveryEvent, ...],
    ) -> None: ...
    async def list_recoveries(
        self, offset: int, limit: int
    ) -> tuple[list[RecoveryBundle], int]: ...
    async def events(self, id: UUID, after: int = 0) -> list[RecoveryEvent]: ...
    async def unfinished(self) -> list[RecoveryBundle]: ...
