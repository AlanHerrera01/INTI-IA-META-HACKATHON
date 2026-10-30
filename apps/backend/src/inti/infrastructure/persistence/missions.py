import asyncio
import json
from datetime import datetime
from typing import Any, cast
from uuid import UUID

from pydantic import TypeAdapter
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, func, select, update
from sqlalchemy.engine import CursorResult, Engine
from sqlalchemy.orm import Mapped, Session, mapped_column

from inti.domain.execution import ExecutionError
from inti.domain.missions import Mission
from inti.infrastructure.persistence import Base

WIRE = TypeAdapter(Mission)


class MissionRecord(Base):
    __tablename__ = "missions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    execution_id: Mapped[str | None] = mapped_column(
        ForeignKey("execution_sessions.id"), unique=True
    )
    plan_id: Mapped[str | None] = mapped_column(ForeignKey("action_plans.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    version: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class SQLAlchemyMissionRepository:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    async def get(self, id: UUID) -> Mission | None:
        def read() -> Mission | None:
            with Session(self.engine) as session:
                row = session.get(MissionRecord, str(id))
                return WIRE.validate_json(json.dumps(row.payload)) if row else None

        return await asyncio.to_thread(read)

    async def for_execution(self, id: UUID) -> Mission | None:
        def read() -> Mission | None:
            with Session(self.engine) as session:
                row = session.scalar(
                    select(MissionRecord).where(MissionRecord.execution_id == str(id))
                )
                return WIRE.validate_json(json.dumps(row.payload)) if row else None

        return await asyncio.to_thread(read)

    async def save(self, mission: Mission, expected_version: int | None) -> None:
        def write() -> None:
            values = dict(
                execution_id=str(mission.execution_id) if mission.execution_id else None,
                plan_id=str(mission.plan_id) if mission.plan_id else None,
                version=mission.version,
                updated_at=mission.updated_at,
                payload=WIRE.dump_python(mission, mode="json"),
            )
            with Session(self.engine) as session, session.begin():
                if expected_version is None:
                    session.add(MissionRecord(id=str(mission.id), **values))
                else:
                    changed = session.execute(
                        update(MissionRecord)
                        .where(
                            MissionRecord.id == str(mission.id),
                            MissionRecord.version == expected_version,
                        )
                        .values(**values)
                    )
                    if cast(CursorResult[Any], changed).rowcount != 1:
                        raise ExecutionError("MISSION_CHANGED", "Reload the current mission")

        await asyncio.to_thread(write)

    async def list(self, offset: int, limit: int) -> tuple[list[Mission], int]:
        def read() -> tuple[list[Mission], int]:
            with Session(self.engine) as session:
                rows = session.scalars(
                    select(MissionRecord)
                    .order_by(MissionRecord.updated_at.desc())
                    .offset(offset)
                    .limit(limit)
                ).all()
                total = session.scalar(select(func.count()).select_from(MissionRecord)) or 0
                return [WIRE.validate_json(json.dumps(row.payload)) for row in rows], total

        return await asyncio.to_thread(read)
