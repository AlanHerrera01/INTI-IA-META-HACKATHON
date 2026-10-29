from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from inti.domain.entities import Observation
from inti.domain.execution import ExecutionBundle, ExecutionEvent
from inti.domain.planning import aware
from inti.domain.verification import (
    CriteriaVersion,
    Evidence,
    EvidenceMetadata,
    EvidenceType,
    ValidatedEvidence,
    VerificationBundle,
    VerificationEvent,
)


@dataclass(frozen=True)
class StateReadRequest:
    collection_id: UUID
    execution_id: UUID
    task_id: UUID
    record_id: str
    nonce: UUID

    def __post_init__(self) -> None:
        from inti.domain.verification import TargetReference

        TargetReference(self.record_id)


@dataclass(frozen=True)
class ReadOnlyBrowserCapture:
    observation: Observation
    png: bytes
    dom: dict[str, str | int | bool | None]


class ReadOnlyBrowserEvidencePort(Protocol):
    async def capture_readonly(self, request: StateReadRequest) -> ReadOnlyBrowserCapture: ...


@dataclass(frozen=True)
class InventoryRecord:
    id: str
    name: str
    location: str
    status: str
    version: int

    def __post_init__(self) -> None:
        from inti.domain.verification import TargetReference

        TargetReference(self.id)
        if self.status not in {"Available", "In use", "Maintenance", "Inactive", "Operational"}:
            raise ValueError("Invalid persisted inventory status")
        if type(self.version) is not int or self.version < 1:
            raise ValueError("Invalid persisted record version")
        if not all(1 <= len(value) <= 150 for value in (self.name, self.location)):
            raise ValueError("Invalid inventory record values")


@dataclass(frozen=True)
class ReadOnlySnapshot:
    request: StateReadRequest
    captured_at: datetime
    source_system: str
    store_id: UUID
    records: tuple[InventoryRecord, ...]
    read_only: bool

    def __post_init__(self) -> None:
        aware(self.captured_at)
        if self.source_system != "inti.inventory.readonly.sqlite.v1" or self.read_only is not True:
            raise ValueError("Unrecognized read-only evidence source")
        if len(self.records) > 1000 or len({r.id for r in self.records}) != len(self.records):
            raise ValueError("Persisted snapshot contains duplicate or excessive records")


@dataclass(frozen=True)
class CollectedEvidence:
    evidence_type: EvidenceType
    source: str
    captured_at: datetime
    content: bytes
    metadata: EvidenceMetadata


@dataclass(frozen=True)
class EvidenceCollection:
    items: tuple[CollectedEvidence, ...]
    failures: tuple[str, ...] = ()


class ReadOnlyApplicationStatePort(Protocol):
    async def read_snapshot(self, request: StateReadRequest) -> ReadOnlySnapshot: ...


class EvidenceCollectorPort(Protocol):
    async def collect(
        self, bundle: VerificationBundle, execution: ExecutionBundle
    ) -> EvidenceCollection: ...


class EvidenceStoragePort(Protocol):
    async def write(self, id: UUID, content: bytes) -> None: ...
    async def read(self, id: UUID) -> bytes: ...
    async def delete(self, id: UUID) -> None: ...


class EvidenceIntegrityPort(Protocol):
    def validate(
        self,
        evidence: Evidence,
        content: bytes,
        bundle: VerificationBundle,
        execution: ExecutionBundle,
        allow_archived: bool = False,
    ) -> ValidatedEvidence: ...


class VerificationRepositoryPort(Protocol):
    async def get(self, id: UUID) -> VerificationBundle | None: ...
    async def find(
        self, execution_id: UUID, criteria_id: UUID, key: str
    ) -> VerificationBundle | None: ...
    async def criteria(self, id: UUID) -> CriteriaVersion | None: ...
    async def latest_criteria(self, execution_id: UUID) -> CriteriaVersion | None: ...
    async def save_criteria(self, criteria: CriteriaVersion, expected_version: int) -> None: ...
    async def commit(
        self,
        bundle: VerificationBundle,
        expected_version: int | None,
        events: tuple[VerificationEvent, ...],
    ) -> None: ...
    async def list_verifications(
        self, offset: int, limit: int, execution_id: UUID | None = None
    ) -> tuple[list[VerificationBundle], int]: ...
    async def events(self, id: UUID, after: int = 0) -> list[VerificationEvent]: ...
    async def unfinished(self) -> list[VerificationBundle]: ...


class VerificationEventPublisherPort(Protocol):
    async def commit(
        self,
        bundle: VerificationBundle,
        expected_version: int | None,
        events: tuple[VerificationEvent, ...],
    ) -> None: ...


class VerificationTriggerPort(Protocol):
    async def prepare(self, execution_id: UUID) -> None: ...
    async def completed(self, execution_id: UUID) -> None: ...


class ExecutionEvidenceReaderPort(Protocol):
    async def get(self, id: UUID) -> ExecutionBundle | None: ...
    async def events(self, id: UUID, after: int = 0) -> list[ExecutionEvent]: ...
