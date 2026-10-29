import asyncio
import json
from collections.abc import Callable
from dataclasses import replace
from datetime import datetime
from typing import Any, TypeVar
from uuid import UUID

from pydantic import TypeAdapter
from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
    func,
    select,
    update,
)
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Mapped, Session, mapped_column

from inti.domain.execution import ExecutionError, ExecutionEvent
from inti.domain.verification import (
    V_TERMINAL,
    CriteriaVersion,
    VerificationBundle,
    VerificationEvent,
)
from inti.infrastructure.persistence import Base
from inti.infrastructure.persistence.execution import ExecutionEventRecord

BUNDLE = TypeAdapter(VerificationBundle)
CRITERIA = TypeAdapter(CriteriaVersion)
EVENT = TypeAdapter(VerificationEvent)
T = TypeVar("T")


class CriteriaVersionRecord(Base):
    __tablename__ = "criteria_versions"
    __table_args__ = (UniqueConstraint("execution_id", "version", name="uq_criteria_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_sessions.id"), index=True)
    task_id: Mapped[str] = mapped_column(String(36), index=True)
    version: Mapped[int] = mapped_column(Integer)
    digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class SuccessCriterionRecord(Base):
    __tablename__ = "success_criteria"
    criteria_version_id: Mapped[str] = mapped_column(
        ForeignKey("criteria_versions.id"), primary_key=True
    )
    criterion_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(36), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class VerificationSessionRecord(Base):
    __tablename__ = "verification_sessions"
    __table_args__ = (
        UniqueConstraint(
            "execution_id", "criteria_version_id", "idempotency_key", name="uq_verification_request"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_sessions.id"), index=True)
    task_id: Mapped[str] = mapped_column(String(36), index=True)
    criteria_version_id: Mapped[str] = mapped_column(ForeignKey("criteria_versions.id"))
    idempotency_key: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(32), index=True)
    final_verdict: Mapped[str | None] = mapped_column(String(32), nullable=True)
    version: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class EvidenceRecord(Base):
    __tablename__ = "evidence_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    verification_id: Mapped[str] = mapped_column(ForeignKey("verification_sessions.id"), index=True)
    evidence_type: Mapped[str] = mapped_column(String(40))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    artifact_reference: Mapped[str] = mapped_column(String(36))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class CriterionResultRecord(Base):
    __tablename__ = "criterion_results"
    __table_args__ = (
        ForeignKeyConstraint(
            ["criteria_version_id", "criterion_id"],
            ["success_criteria.criteria_version_id", "success_criteria.criterion_id"],
        ),
    )
    verification_id: Mapped[str] = mapped_column(
        ForeignKey("verification_sessions.id"), primary_key=True
    )
    criterion_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    criteria_version_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(10))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class VerificationEventRecord(Base):
    __tablename__ = "verification_events"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(36), unique=True)
    verification_id: Mapped[str] = mapped_column(ForeignKey("verification_sessions.id"), index=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_sessions.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(50))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class SQLAlchemyVerificationRepository:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    async def _run(self, call: Callable[[], T]) -> T:
        try:
            return await asyncio.to_thread(call)
        except SQLAlchemyError as exc:
            raise ExecutionError(
                "VERIFICATION_DATABASE_ERROR",
                "Verification record could not be read or committed safely",
            ) from exc

    async def get(self, id: UUID) -> VerificationBundle | None:
        def read() -> VerificationBundle | None:
            with Session(self.engine) as session:
                row = session.get(VerificationSessionRecord, str(id))
                return BUNDLE.validate_json(json.dumps(row.payload)) if row else None

        return await self._run(read)

    async def find(
        self, execution_id: UUID, criteria_id: UUID, key: str
    ) -> VerificationBundle | None:
        def read() -> VerificationBundle | None:
            with Session(self.engine) as session:
                row = session.scalar(
                    select(VerificationSessionRecord).where(
                        VerificationSessionRecord.execution_id == str(execution_id),
                        VerificationSessionRecord.criteria_version_id == str(criteria_id),
                        VerificationSessionRecord.idempotency_key == key,
                    )
                )
                return BUNDLE.validate_json(json.dumps(row.payload)) if row else None

        return await self._run(read)

    async def criteria(self, id: UUID) -> CriteriaVersion | None:
        def read() -> CriteriaVersion | None:
            with Session(self.engine) as session:
                row = session.get(CriteriaVersionRecord, str(id))
                return CRITERIA.validate_json(json.dumps(row.payload)) if row else None

        return await self._run(read)

    async def latest_criteria(self, execution_id: UUID) -> CriteriaVersion | None:
        def read() -> CriteriaVersion | None:
            with Session(self.engine) as session:
                row = session.scalar(
                    select(CriteriaVersionRecord)
                    .where(CriteriaVersionRecord.execution_id == str(execution_id))
                    .order_by(CriteriaVersionRecord.version.desc())
                    .limit(1)
                )
                return CRITERIA.validate_json(json.dumps(row.payload)) if row else None

        return await self._run(read)

    async def save_criteria(self, criteria: CriteriaVersion, expected_version: int) -> None:
        def write() -> None:
            payload = CRITERIA.dump_python(criteria, mode="json")
            with Session(self.engine) as session, session.begin():
                latest = (
                    session.scalar(
                        select(func.max(CriteriaVersionRecord.version)).where(
                            CriteriaVersionRecord.execution_id == str(criteria.execution_id)
                        )
                    )
                    or 0
                )
                if latest != expected_version or criteria.version != expected_version + 1:
                    raise ExecutionError(
                        "CONCURRENT_CRITERIA_UPDATE",
                        "Criteria changed; review the latest authorized version",
                    )
                session.add(
                    CriteriaVersionRecord(
                        id=str(criteria.id),
                        execution_id=str(criteria.execution_id),
                        task_id=str(criteria.task_id),
                        version=criteria.version,
                        digest=criteria.digest,
                        created_at=criteria.created_at,
                        payload=payload,
                    )
                )
                session.flush()
                for criterion in payload["criteria"]:
                    session.add(
                        SuccessCriterionRecord(
                            criteria_version_id=str(criteria.id),
                            criterion_id=criterion["id"],
                            task_id=str(criteria.task_id),
                            payload=criterion,
                        )
                    )

        await self._run(write)

    async def commit(
        self,
        bundle: VerificationBundle,
        expected_version: int | None,
        events: tuple[VerificationEvent, ...],
    ) -> None:
        def write() -> None:
            state = bundle.session
            payload = BUNDLE.dump_python(bundle, mode="json")
            with Session(self.engine) as session, session.begin():
                values = dict(
                    execution_id=str(state.execution_id),
                    task_id=str(state.task_id),
                    criteria_version_id=str(state.criteria_version_id),
                    idempotency_key=state.idempotency_key,
                    status=state.status,
                    final_verdict=state.final_verdict,
                    version=state.version,
                    started_at=state.started_at,
                    completed_at=state.completed_at,
                    payload=payload,
                )
                if expected_version is None:
                    session.add(VerificationSessionRecord(id=str(state.id), **values))
                else:
                    result = session.execute(
                        update(VerificationSessionRecord)
                        .where(
                            VerificationSessionRecord.id == str(state.id),
                            VerificationSessionRecord.version == expected_version,
                        )
                        .values(**values)
                    )
                    if getattr(result, "rowcount", 0) != 1:
                        raise ExecutionError(
                            "CONCURRENT_UPDATE", "Verification changed; refresh before retrying"
                        )
                session.flush()
                for evidence in payload["evidence"]:
                    existing = session.get(EvidenceRecord, evidence["id"])
                    if existing:
                        if existing.payload != evidence:
                            raise ExecutionError(
                                "EVIDENCE_IMMUTABLE",
                                "Existing evidence records cannot be rewritten",
                            )
                    else:
                        item = next(e for e in bundle.evidence if str(e.id) == evidence["id"])
                        session.add(
                            EvidenceRecord(
                                id=evidence["id"],
                                verification_id=str(state.id),
                                evidence_type=item.evidence_type,
                                captured_at=item.captured_at,
                                content_hash=item.content_hash,
                                artifact_reference=str(item.artifact_reference),
                                payload=evidence,
                            )
                        )
                for result in payload["session"]["criteria_results"]:
                    existing_result = session.get(
                        CriterionResultRecord, (str(state.id), result["criterion_id"])
                    )
                    if existing_result and existing_result.payload != result:
                        raise ExecutionError(
                            "RESULT_IMMUTABLE", "Evaluated criteria cannot be rewritten"
                        )
                    if not existing_result:
                        session.add(
                            CriterionResultRecord(
                                verification_id=str(state.id),
                                criterion_id=result["criterion_id"],
                                criteria_version_id=str(state.criteria_version_id),
                                status=result["status"],
                                payload=result,
                            )
                        )
                for event in events:
                    session.add(
                        VerificationEventRecord(
                            id=str(event.id),
                            verification_id=str(state.id),
                            execution_id=str(state.execution_id),
                            event_type=event.event_type,
                            timestamp=event.timestamp,
                            payload=EVENT.dump_python(event, mode="json"),
                        )
                    )
                    projected = ExecutionEvent(
                        state.execution_id,
                        event.event_type,
                        event.timestamp,
                        {**event.payload, "verification_id": str(state.id)},
                        event.id,
                    )
                    session.add(
                        ExecutionEventRecord(
                            id=str(event.id),
                            execution_id=str(state.execution_id),
                            event_type=event.event_type,
                            timestamp=event.timestamp,
                            payload=TypeAdapter(ExecutionEvent).dump_python(projected, mode="json"),
                        )
                    )

        await self._run(write)

    async def list_verifications(
        self, offset: int, limit: int, execution_id: UUID | None = None
    ) -> tuple[list[VerificationBundle], int]:
        def read() -> tuple[list[VerificationBundle], int]:
            with Session(self.engine) as session:
                query = select(VerificationSessionRecord)
                count = select(func.count()).select_from(VerificationSessionRecord)
                if execution_id:
                    query = query.where(VerificationSessionRecord.execution_id == str(execution_id))
                    count = count.where(VerificationSessionRecord.execution_id == str(execution_id))
                total = session.scalar(count) or 0
                rows = session.scalars(
                    query.order_by(VerificationSessionRecord.started_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
                return [BUNDLE.validate_json(json.dumps(row.payload)) for row in rows], total

        return await self._run(read)

    async def events(self, id: UUID, after: int = 0) -> list[VerificationEvent]:
        def read() -> list[VerificationEvent]:
            with Session(self.engine) as session:
                rows = session.scalars(
                    select(VerificationEventRecord)
                    .where(
                        VerificationEventRecord.verification_id == str(id),
                        VerificationEventRecord.sequence > after,
                    )
                    .order_by(VerificationEventRecord.sequence)
                    .limit(1000)
                )
                return [
                    replace(EVENT.validate_json(json.dumps(row.payload)), sequence=row.sequence)
                    for row in rows
                ]

        return await self._run(read)

    async def unfinished(self) -> list[VerificationBundle]:
        def read() -> list[VerificationBundle]:
            with Session(self.engine) as session:
                rows = session.scalars(
                    select(VerificationSessionRecord).where(
                        VerificationSessionRecord.status.not_in([s.value for s in V_TERMINAL])
                    )
                )
                return [BUNDLE.validate_json(json.dumps(row.payload)) for row in rows]

        return await self._run(read)
