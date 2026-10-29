import asyncio

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from inti.infrastructure.persistence import SQLAlchemyObservationRepository


def test_upgrade_downgrade_preserves_existing_observation(tmp_path, monkeypatch, observation):
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config("apps/backend/alembic.ini")
    command.upgrade(config, "0001")
    repository = SQLAlchemyObservationRepository(url)
    asyncio.run(repository.save(observation))
    command.upgrade(config, "head")
    assert {"visual_scenes", "action_plans", "planned_actions", "planning_events"} <= set(
        inspect(repository.engine).get_table_names()
    )
    assert asyncio.run(repository.get(observation.id)) == observation
    command.downgrade(config, "0001")
    assert "action_plans" not in inspect(repository.engine).get_table_names()
    assert asyncio.run(repository.get(observation.id)) == observation
    command.upgrade(config, "head")
    assert asyncio.run(repository.get(observation.id)) == observation
    repository.engine.dispose()
