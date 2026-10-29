import asyncio
import json
from collections.abc import Callable
from dataclasses import replace
from datetime import datetime
from typing import Any, TypeVar
from uuid import UUID

from pydantic import TypeAdapter
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, func, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Mapped, Session, mapped_column

from inti.domain.execution import ExecutionBundle, ExecutionError, ExecutionEvent, ExecutionStatus
from inti.infrastructure.persistence import Base

BUNDLE = TypeAdapter(ExecutionBundle)
EVENT = TypeAdapter(ExecutionEvent)
T = TypeVar("T")


class ExecutionSessionRecord(Base):
    __tablename__ = "execution_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("action_plans.id"), index=True)
    task_id: Mapped[str] = mapped_column(String(36), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    version: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class BrowserSessionRecord(Base):
    __tablename__ = "browser_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_sessions.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class ActionExecutionResultRecord(Base):
    __tablename__ = "action_execution_results"
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_sessions.id"), primary_key=True)
    action_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(20))
    before_observation_id: Mapped[str | None] = mapped_column(
        ForeignKey("observations.id"), nullable=True
    )
    after_observation_id: Mapped[str | None] = mapped_column(
        ForeignKey("observations.id"), nullable=True
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class ExecutionEventRecord(Base):
    __tablename__ = "execution_events"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(36), unique=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_sessions.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(50))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class AuthorizationDecisionRecord(Base):
    __tablename__ = "authorization_decisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_sessions.id"), index=True)
    action_id: Mapped[str] = mapped_column(String(36))
    approved: Mapped[bool] = mapped_column(Boolean)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class SQLAlchemyExecutionRepository:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    async def _run(self, call: Callable[[], T]) -> T:
        try:
            return await asyncio.to_thread(call)
        except SQLAlchemyError as exc:
            raise ExecutionError(
                "EXECUTION_DATABASE_ERROR", "Execution state could not be committed safely"
            ) from exc

    async def get(self, id: UUID) -> ExecutionBundle | None:
        def call() -> ExecutionBundle | None:
            with Session(self.engine) as session:
                row = session.get(ExecutionSessionRecord, str(id))
                return BUNDLE.validate_json(json.dumps(row.payload)) if row else None

        return await self._run(call)

    async def commit(
        self,
        bundle: ExecutionBundle,
        expected_version: int | None,
        events: tuple[ExecutionEvent, ...],
    ) -> None:
        def call() -> None:
            payload = BUNDLE.dump_python(bundle, mode="json")
            execution = bundle.session
            with Session(self.engine) as session, session.begin():
                values = dict(
                    plan_id=str(execution.plan_id),
                    task_id=str(execution.task_id),
                    status=execution.status,
                    version=execution.version,
                    updated_at=execution.updated_at,
                    payload=payload,
                )
                if expected_version is None:
                    session.add(ExecutionSessionRecord(id=str(execution.id), **values))
                else:
                    result = session.execute(
                        update(ExecutionSessionRecord)
                        .where(
                            ExecutionSessionRecord.id == str(execution.id),
                            ExecutionSessionRecord.version == expected_version,
                        )
                        .values(**values)
                    )
                    if getattr(result, "rowcount", 0) != 1:
                        raise ExecutionError(
                            "CONCURRENT_UPDATE", "Execution state changed; refresh before retrying"
                        )
                session.flush()
                for decision in payload["decisions"]:
                    session.merge(
                        AuthorizationDecisionRecord(
                            id=decision["id"],
                            execution_id=str(execution.id),
                            action_id=decision["action_id"],
                            approved=decision["decision"] == "APPROVED",
                            payload=decision,
                        )
                    )
                for action in payload["results"]:
                    session.merge(
                        ActionExecutionResultRecord(
                            execution_id=str(execution.id),
                            action_id=action["action_id"],
                            status=action["status"],
                            before_observation_id=action["before_observation_id"],
                            after_observation_id=action["after_observation_id"],
                            payload=action,
                        )
                    )
                browser = payload["browser_session"]
                if browser:
                    session.merge(
                        BrowserSessionRecord(
                            id=browser["id"],
                            execution_id=str(execution.id),
                            status=browser["status"],
                            payload=browser,
                        )
                    )
                for event in events:
                    session.add(
                        ExecutionEventRecord(
                            id=str(event.id),
                            execution_id=str(execution.id),
                            event_type=event.event_type,
                            timestamp=event.timestamp,
                            payload=EVENT.dump_python(event, mode="json"),
                        )
                    )

        await self._run(call)

    async def events(self, id: UUID, after: int = 0) -> list[ExecutionEvent]:
        def call() -> list[ExecutionEvent]:
            with Session(self.engine) as session:
                rows = session.scalars(
                    select(ExecutionEventRecord)
                    .where(
                        ExecutionEventRecord.execution_id == str(id),
                        ExecutionEventRecord.sequence > after,
                    )
                    .order_by(ExecutionEventRecord.sequence)
                    .limit(1000)
                )
                return [
                    replace(EVENT.validate_json(json.dumps(row.payload)), sequence=row.sequence)
                    for row in rows
                ]

        return await self._run(call)

    async def list_executions(self, offset: int, limit: int) -> tuple[list[ExecutionBundle], int]:
        def call() -> tuple[list[ExecutionBundle], int]:
            with Session(self.engine) as session:
                rows = session.scalars(
                    select(ExecutionSessionRecord)
                    .order_by(
                        ExecutionSessionRecord.updated_at.desc(), ExecutionSessionRecord.id.desc()
                    )
                    .offset(offset)
                    .limit(limit)
                )
                items = [BUNDLE.validate_json(json.dumps(row.payload)) for row in rows]
                total = (
                    session.scalar(select(func.count()).select_from(ExecutionSessionRecord)) or 0
                )
                return items, total

        return await self._run(call)

    async def unfinished(self) -> list[ExecutionBundle]:
        def call() -> list[ExecutionBundle]:
            with Session(self.engine) as session:
                rows = session.scalars(
                    select(ExecutionSessionRecord).where(
                        ExecutionSessionRecord.status.in_(
                            [
                                ExecutionStatus.RUNNING,
                                ExecutionStatus.PAUSED,
                                ExecutionStatus.RECOVERING,
                            ]
                        )
                    )
                )
                return [BUNDLE.validate_json(json.dumps(row.payload)) for row in rows]

        return await self._run(call)
