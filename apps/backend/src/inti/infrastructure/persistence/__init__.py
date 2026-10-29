import asyncio
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, create_engine, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from inti.domain.entities import Observation, VisionAnalysis
from inti.domain.exceptions import DependencyError


class Base(DeclarativeBase):
    pass


class ObservationRecord(Base):
    __tablename__ = "observations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source_url: Mapped[str] = mapped_column(String(2048))
    page_title: Mapped[str] = mapped_column(String(4096))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    artifact_path: Mapped[str] = mapped_column(String(40))
    analysis_status: Mapped[str] = mapped_column(String(20), default="not_analyzed")
    analysis: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    restricted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class SQLAlchemyObservationRepository:
    def __init__(self, url: str) -> None:
        self.engine = create_engine(url, pool_pre_ping=True)

    def _save(self, observation: Observation) -> None:
        try:
            with Session(self.engine) as session, session.begin():
                session.merge(
                    ObservationRecord(
                        id=str(observation.id),
                        timestamp=observation.timestamp,
                        source_url=observation.source_url,
                        page_title=observation.page_title,
                        width=observation.width,
                        height=observation.height,
                        artifact_path=f"{observation.id}.png",
                        analysis_status="completed" if observation.analysis else "not_analyzed",
                        analysis=asdict(observation.analysis) if observation.analysis else None,
                        restricted=observation.restricted,
                    )
                )
        except SQLAlchemyError as exc:
            raise DependencyError("Observation database unavailable") from exc

    async def save(self, observation: Observation) -> None:
        await asyncio.to_thread(self._save, observation)

    @staticmethod
    def _entity(record: ObservationRecord) -> Observation:
        analysis = record.analysis
        return Observation(
            id=UUID(record.id),
            timestamp=record.timestamp.replace(tzinfo=UTC)
            if record.timestamp.tzinfo is None
            else record.timestamp,
            source_url=record.source_url,
            page_title=record.page_title,
            width=record.width,
            height=record.height,
            analysis=VisionAnalysis(
                model=analysis["model"],
                summary=analysis["summary"],
                elements=tuple(analysis["elements"]),
                ui_state=analysis["ui_state"],
                response_id=analysis.get("response_id"),
            )
            if analysis
            else None,
            restricted=record.restricted,
        )

    def _get(self, id: UUID) -> Observation | None:
        try:
            with Session(self.engine) as session:
                record = session.get(ObservationRecord, str(id))
                return self._entity(record) if record else None
        except SQLAlchemyError as exc:
            raise DependencyError("Observation database unavailable") from exc

    async def get(self, id: UUID) -> Observation | None:
        return await asyncio.to_thread(self._get, id)

    def _latest(self, limit: int) -> list[Observation]:
        try:
            with Session(self.engine) as session:
                records = session.scalars(
                    select(ObservationRecord)
                    .where(ObservationRecord.restricted.is_(False))
                    .order_by(ObservationRecord.timestamp.desc())
                    .limit(limit)
                )
                return [self._entity(record) for record in records]
        except SQLAlchemyError as exc:
            raise DependencyError("Observation database unavailable") from exc

    async def latest(self, limit: int) -> list[Observation]:
        return await asyncio.to_thread(self._latest, limit)

    async def available(self) -> bool:
        def probe() -> bool:
            try:
                with Session(self.engine) as session:
                    session.execute(text("SELECT 1"))
                    session.execute(select(ObservationRecord.id).limit(1))
                return True
            except SQLAlchemyError:
                return False

        return await asyncio.to_thread(probe)
