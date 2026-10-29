"""Real PostgreSQL transaction/pipeline test with explicitly mocked model ports.

Uses a newly generated temporary schema; never writes test plans into live history.
"""

import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.persistence import Base, SQLAlchemyObservationRepository
from inti.infrastructure.persistence.planning import (
    ActionPlanRecord,
    PlannedActionRecord,
    PlanningEventRecord,
    PlanningTelemetryAdapter,
    SQLAlchemyPlanRepository,
    VisualSceneRecord,
)
from inti.main import create_app

pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(
        os.environ.get("INTI_POSTGRES_TESTS") != "1",
        reason="Set INTI_POSTGRES_TESTS=1 for isolated-schema PostgreSQL integration",
    ),
]


async def test_real_postgres_planning_pipeline(planning_services, observation):
    url = ConfigurationProvider().database_url.get_secret_value()
    observations = SQLAlchemyObservationRepository(url)
    original_engine = observations.engine
    schema = f"inti_phase2_test_{uuid4().hex}"
    with original_engine.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
    observations.engine = original_engine.execution_options(schema_translate_map={None: schema})
    try:
        Base.metadata.create_all(observations.engine)
        plans = SQLAlchemyPlanRepository(observations.engine)
        services = planning_services
        services.repository = observations
        services.planning.repository = plans
        services.planning.visual.observations = observations
        services.planning.visual.repository = plans
        services.planning.generate.repository = plans
        services.planning.generate.telemetry = PlanningTelemetryAdapter(plans)
        await observations.save(observation)
        await services.storage.write(observation.id, b"\x89PNG\r\n\x1a\nEXPLICIT-TEST-FIXTURE")
        with TestClient(create_app(services)) as client:
            response = client.post(
                "/api/v1/plans/generate",
                json={
                    "observation_id": str(observation.id),
                    "user_goal": "Find asset EQ-001",
                },
            )
            assert response.status_code == 201, response.text
            result = response.json()
            plan_id = result["plan"]["id"]
            assert result["plan"]["status"] == "valid"
            assert client.get(f"/api/v1/plans/{plan_id}").json() == result
            assert client.get("/api/v1/plans").json()["total"] == 1
            assert len(client.get(f"/api/v1/plans/{plan_id}/events").json()) == 4
            assert client.post(f"/api/v1/plans/{plan_id}/validate").status_code == 200
        with observations.engine.connect() as connection:
            for table in (VisualSceneRecord, ActionPlanRecord, PlannedActionRecord):
                assert connection.scalar(select(func.count()).select_from(table)) == 1
            assert connection.scalar(select(func.count()).select_from(PlanningEventRecord)) == 5
        services.browser.capture.assert_not_awaited()
    finally:
        # Only the schema created above is removed; the default/public schema is untouched.
        with original_engine.begin() as connection:
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        original_engine.dispose()
