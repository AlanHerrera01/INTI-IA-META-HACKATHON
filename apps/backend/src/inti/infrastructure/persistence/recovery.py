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
from inti.domain.recovery import R_TERMINAL, RecoveryBundle, RecoveryEvent
from inti.infrastructure.persistence import Base
from inti.infrastructure.persistence.execution import ExecutionEventRecord

BUNDLE = TypeAdapter(RecoveryBundle)
EVENT = TypeAdapter(RecoveryEvent)
T = TypeVar("T")


class RecoverySessionRecord(Base):
    __tablename__ = "recovery_sessions"
    __table_args__ = (
        UniqueConstraint("execution_id", "failed_action_id", name="uq_recovery_failure"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_sessions.id"), index=True)
    failed_action_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(32), index=True)
    version: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class FailureContextRecord(Base):
    __tablename__ = "failure_contexts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    recovery_id: Mapped[str] = mapped_column(ForeignKey("recovery_sessions.id"), unique=True)
    failure_type: Mapped[str] = mapped_column(String(40), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class RecoveryStrategyRecord(Base):
    __tablename__ = "recovery_strategies"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    recovery_id: Mapped[str] = mapped_column(ForeignKey("recovery_sessions.id"), index=True)
    strategy_type: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class RecoveryAttemptRecord(Base):
    __tablename__ = "recovery_attempts"
    __table_args__ = (
        UniqueConstraint("recovery_id", "attempt_number", name="uq_recovery_attempt"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    recovery_id: Mapped[str] = mapped_column(ForeignKey("recovery_sessions.id"), index=True)
    attempt_number: Mapped[int] = mapped_column(Integer)
    outcome: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class RecoveryEventRecord(Base):
    __tablename__ = "recovery_events"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(36), unique=True)
    recovery_id: Mapped[str] = mapped_column(ForeignKey("recovery_sessions.id"), index=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_sessions.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(50))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class RecoveryEvidenceRecord(Base):
    __tablename__ = "recovery_evidence"
    recovery_id: Mapped[str] = mapped_column(ForeignKey("recovery_sessions.id"), primary_key=True)
    observation_id: Mapped[str] = mapped_column(ForeignKey("observations.id"), primary_key=True)


class SQLAlchemyRecoveryRepository:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    async def _run(self, call: Callable[[], T]) -> T:
        try:
            return await asyncio.to_thread(call)
        except SQLAlchemyError as exc:
            raise ExecutionError(
                "RECOVERY_DATABASE_ERROR", "Recovery state could not be committed safely"
            ) from exc

    async def get(self, id: UUID) -> RecoveryBundle | None:
        def read() -> RecoveryBundle | None:
            with Session(self.engine) as session:
                row = session.get(RecoverySessionRecord, str(id))
                return BUNDLE.validate_json(json.dumps(row.payload)) if row else None

        return await self._run(read)

    async def for_failure(self, execution_id: UUID, action_id: UUID) -> RecoveryBundle | None:
        def read() -> RecoveryBundle | None:
            with Session(self.engine) as session:
                row = session.scalar(
                    select(RecoverySessionRecord).where(
                        RecoverySessionRecord.execution_id == str(execution_id),
                        RecoverySessionRecord.failed_action_id == str(action_id),
                    )
                )
                return BUNDLE.validate_json(json.dumps(row.payload)) if row else None

        return await self._run(read)

    async def commit(
        self,
        bundle: RecoveryBundle,
        expected_version: int | None,
        events: tuple[RecoveryEvent, ...],
    ) -> None:
        def write() -> None:
            payload = BUNDLE.dump_python(bundle, mode="json")
            state = bundle.session
            with Session(self.engine) as session, session.begin():
                values = dict(
                    execution_id=str(state.execution_id),
                    failed_action_id=str(state.failed_action_id),
                    status=state.status,
                    version=state.version,
                    started_at=state.started_at,
                    completed_at=state.completed_at,
                    payload=payload,
                )
                if expected_version is None:
                    session.add(RecoverySessionRecord(id=str(state.id), **values))
                else:
                    result = session.execute(
                        update(RecoverySessionRecord)
                        .where(
                            RecoverySessionRecord.id == str(state.id),
                            RecoverySessionRecord.version == expected_version,
                        )
                        .values(**values)
                    )
                    if getattr(result, "rowcount", 0) != 1:
                        raise ExecutionError(
                            "CONCURRENT_UPDATE", "Recovery changed; refresh before retrying"
                        )
                session.flush()
                context = payload["context"]
                session.merge(
                    FailureContextRecord(
                        id=context["id"],
                        recovery_id=str(state.id),
                        failure_type=context["failure_type"],
                        payload=context,
                    )
                )
                for diagnosis in payload["diagnoses"]:
                    for strategy in diagnosis["strategies"]:
                        session.merge(
                            RecoveryStrategyRecord(
                                id=strategy["id"],
                                recovery_id=str(state.id),
                                strategy_type=strategy["strategy_type"],
                                payload=strategy,
                            )
                        )
                for attempt in payload["attempts"]:
                    session.merge(
                        RecoveryAttemptRecord(
                            id=attempt["id"],
                            recovery_id=str(state.id),
                            attempt_number=attempt["attempt_number"],
                            outcome=attempt["outcome"],
                            payload=attempt,
                        )
                    )
                for evidence in state.evidence_ids:
                    session.merge(
                        RecoveryEvidenceRecord(
                            recovery_id=str(state.id), observation_id=str(evidence)
                        )
                    )
                for event in events:
                    session.add(
                        RecoveryEventRecord(
                            id=str(event.id),
                            recovery_id=str(state.id),
                            execution_id=str(state.execution_id),
                            event_type=event.event_type,
                            timestamp=event.timestamp,
                            payload=EVENT.dump_python(event, mode="json"),
                        )
                    )
                    # Atomic projection into the existing execution WebSocket event history.
                    projected = ExecutionEvent(
                        state.execution_id,
                        event.event_type,
                        event.timestamp,
                        {**event.payload, "recovery_id": str(state.id)},
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

    async def list_recoveries(self, offset: int, limit: int) -> tuple[list[RecoveryBundle], int]:
        def read() -> tuple[list[RecoveryBundle], int]:
            with Session(self.engine) as session:
                total = session.scalar(select(func.count()).select_from(RecoverySessionRecord)) or 0
                rows = session.scalars(
                    select(RecoverySessionRecord)
                    .order_by(RecoverySessionRecord.started_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
                return [BUNDLE.validate_json(json.dumps(r.payload)) for r in rows], total

        return await self._run(read)

    async def events(self, id: UUID, after: int = 0) -> list[RecoveryEvent]:
        def read() -> list[RecoveryEvent]:
            with Session(self.engine) as session:
                rows = session.scalars(
                    select(RecoveryEventRecord)
                    .where(
                        RecoveryEventRecord.recovery_id == str(id),
                        RecoveryEventRecord.sequence > after,
                    )
                    .order_by(RecoveryEventRecord.sequence)
                    .limit(1000)
                )
                return [
                    replace(EVENT.validate_json(json.dumps(r.payload)), sequence=r.sequence)
                    for r in rows
                ]

        return await self._run(read)

    async def unfinished(self) -> list[RecoveryBundle]:
        def read() -> list[RecoveryBundle]:
            with Session(self.engine) as session:
                rows = session.scalars(
                    select(RecoverySessionRecord).where(
                        RecoverySessionRecord.status.not_in([s.value for s in R_TERMINAL]),
                        RecoverySessionRecord.completed_at.is_(None),
                    )
                )
                return [BUNDLE.validate_json(json.dumps(r.payload)) for r in rows]

        return await self._run(read)
