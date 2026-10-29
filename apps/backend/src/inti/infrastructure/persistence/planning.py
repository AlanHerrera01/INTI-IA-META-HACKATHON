import asyncio
import json
import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any, TypeVar
from uuid import UUID

from pydantic import TypeAdapter
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, delete, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Mapped, Session, mapped_column

from inti.domain.exceptions import DependencyError
from inti.domain.planning import PlanningEvent, PlanningResult, VisualScene
from inti.domain.planning_ports import PlanRepositoryPort
from inti.infrastructure.persistence import Base

T = TypeVar("T")
SCENE = TypeAdapter(VisualScene)
RESULT = TypeAdapter(PlanningResult)
EVENT = TypeAdapter(PlanningEvent)


class VisualSceneRecord(Base):
    __tablename__ = "visual_scenes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    observation_id: Mapped[str] = mapped_column(ForeignKey("observations.id"), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class ActionPlanRecord(Base):
    __tablename__ = "action_plans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(36), unique=True)
    observation_id: Mapped[str] = mapped_column(ForeignKey("observations.id"), index=True)
    scene_id: Mapped[str] = mapped_column(ForeignKey("visual_scenes.id"))
    status: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class PlannedActionRecord(Base):
    __tablename__ = "planned_actions"
    plan_id: Mapped[str] = mapped_column(
        ForeignKey("action_plans.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    action_id: Mapped[str] = mapped_column(String(80))
    action_type: Mapped[str] = mapped_column(String(32))
    risk_level: Mapped[str] = mapped_column(String(16))


class PlanningEventRecord(Base):
    __tablename__ = "planning_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(36), index=True)
    plan_id: Mapped[str | None] = mapped_column(
        ForeignKey("action_plans.id"), nullable=True, index=True
    )
    correlation_id: Mapped[str] = mapped_column(String(36), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class SQLAlchemyPlanRepository:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    async def _run(self, operation: Callable[[], T]) -> T:
        try:
            return await asyncio.to_thread(operation)
        except SQLAlchemyError as exc:
            raise DependencyError("Planning database unavailable") from exc

    @staticmethod
    def _event(event: PlanningEvent) -> PlanningEventRecord:
        return PlanningEventRecord(
            id=str(event.id),
            task_id=str(event.task_id),
            plan_id=str(event.plan_id) if event.plan_id else None,
            correlation_id=str(event.correlation_id),
            timestamp=event.timestamp,
            payload=EVENT.dump_python(event, mode="json"),
        )

    async def save_scene(self, scene: VisualScene) -> None:
        def save() -> None:
            with Session(self.engine) as session, session.begin():
                session.merge(
                    VisualSceneRecord(
                        id=str(scene.id),
                        observation_id=str(scene.observation_id),
                        payload=SCENE.dump_python(scene, mode="json"),
                    )
                )

        await self._run(save)

    async def save(self, result: PlanningResult, event: PlanningEvent) -> None:
        def save() -> None:
            plan = result.plan
            with Session(self.engine) as session, session.begin():
                session.merge(
                    VisualSceneRecord(
                        id=str(result.scene.id),
                        observation_id=str(plan.observation_id),
                        payload=SCENE.dump_python(result.scene, mode="json"),
                    )
                )
                session.flush()
                session.merge(
                    ActionPlanRecord(
                        id=str(plan.id),
                        task_id=str(plan.task_id),
                        observation_id=str(plan.observation_id),
                        scene_id=str(result.scene.id),
                        status=plan.status,
                        created_at=plan.created_at,
                        payload=RESULT.dump_python(result, mode="json"),
                    )
                )
                session.flush()
                session.execute(
                    delete(PlannedActionRecord).where(PlannedActionRecord.plan_id == str(plan.id))
                )
                for position, action in enumerate(plan.actions):
                    session.add(
                        PlannedActionRecord(
                            plan_id=str(plan.id),
                            position=position,
                            action_id=action.id,
                            action_type=action.action_type,
                            risk_level=action.risk_level,
                        )
                    )
                session.add(self._event(event))

        await self._run(save)

    async def get(self, id: UUID) -> PlanningResult | None:
        def get() -> PlanningResult | None:
            with Session(self.engine) as session:
                row = session.get(ActionPlanRecord, str(id))
                return RESULT.validate_json(json.dumps(row.payload)) if row else None

        return await self._run(get)

    async def list_plans(self, offset: int, limit: int) -> tuple[list[PlanningResult], int]:
        def query() -> tuple[list[PlanningResult], int]:
            with Session(self.engine) as session:
                rows = session.scalars(
                    select(ActionPlanRecord)
                    .order_by(ActionPlanRecord.created_at.desc(), ActionPlanRecord.id.desc())
                    .offset(offset)
                    .limit(limit)
                )
                items = [RESULT.validate_json(json.dumps(row.payload)) for row in rows]
                total = session.scalar(select(func.count()).select_from(ActionPlanRecord)) or 0
                return items, total

        return await self._run(query)

    async def events(self, id: UUID) -> list[PlanningEvent]:
        def query() -> list[PlanningEvent]:
            with Session(self.engine) as session:
                plan = session.get(ActionPlanRecord, str(id))
                if not plan:
                    return []
                rows = session.scalars(
                    select(PlanningEventRecord)
                    .where(PlanningEventRecord.task_id == plan.task_id)
                    .order_by(PlanningEventRecord.timestamp, PlanningEventRecord.id)
                )
                return [EVENT.validate_json(json.dumps(row.payload)) for row in rows]

        return await self._run(query)

    async def record_event(self, event: PlanningEvent) -> None:
        def save() -> None:
            with Session(self.engine) as session, session.begin():
                session.add(self._event(event))

        await self._run(save)


class PlanningTelemetryAdapter:
    def __init__(self, repository: PlanRepositoryPort) -> None:
        self.repository = repository
        self.logger = logging.getLogger("inti.planning")

    async def record(self, event: PlanningEvent) -> None:
        # Goals, screenshots, provider error bodies and credentials are excluded.
        self.logger.info(EVENT.dump_json(event).decode("utf-8"))
        await self.repository.record_event(event)
