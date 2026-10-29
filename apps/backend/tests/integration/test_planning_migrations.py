import asyncio

from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, Table, inspect, select

from inti.infrastructure.persistence import SQLAlchemyObservationRepository


def test_upgrade_downgrade_preserves_existing_observation(tmp_path, monkeypatch, observation):
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config("apps/backend/alembic.ini")
    command.upgrade(config, "0001")
    repository = SQLAlchemyObservationRepository(url)
    old_table = Table("observations", MetaData(), autoload_with=repository.engine)
    with repository.engine.begin() as connection:
        connection.execute(
            old_table.insert().values(
                id=str(observation.id),
                timestamp=observation.timestamp,
                source_url=observation.source_url,
                page_title=observation.page_title,
                width=observation.width,
                height=observation.height,
                artifact_path=f"{observation.id}.png",
                analysis_status="not_analyzed",
                analysis=None,
            )
        )
    command.upgrade(config, "head")
    assert {"visual_scenes", "action_plans", "planned_actions", "planning_events"} <= set(
        inspect(repository.engine).get_table_names()
    )
    assert asyncio.run(repository.get(observation.id)) == observation
    assert {
        "execution_sessions",
        "execution_events",
        "authorization_decisions",
        "browser_sessions",
        "action_execution_results",
    } <= set(inspect(repository.engine).get_table_names())
    assert {
        "recovery_sessions",
        "recovery_attempts",
        "recovery_events",
        "verification_sessions",
        "criteria_versions",
        "success_criteria",
        "evidence_records",
        "criterion_results",
        "verification_events",
    } <= set(inspect(repository.engine).get_table_names())
    command.downgrade(config, "0001")
    assert "action_plans" not in inspect(repository.engine).get_table_names()
    with repository.engine.connect() as connection:
        assert connection.scalar(select(old_table.c.id)) == str(observation.id)
    command.upgrade(config, "head")
    assert asyncio.run(repository.get(observation.id)) == observation
    repository.engine.dispose()
