from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from inti.application.planning import (
    GenerateActionPlanUseCase,
    InterpretTaskIntentUseCase,
    InterpretVisualSceneUseCase,
)
from inti.domain.entities import Observation
from inti.domain.planning import (
    ActionParameters,
    ActionTarget,
    BoundingBox,
    CoordinateSystem,
    ElementType,
    GroundingSource,
    ModelUsage,
    PlannedAction,
    PlannedActionType,
    RiskLevel,
    TaskIntent,
    Viewport,
    VisualElement,
    VisualScene,
)
from inti.domain.planning_policy import PlanningPolicy
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.grounding import VisualGroundingAdapter
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.infrastructure.persistence import Base, SQLAlchemyObservationRepository
from inti.infrastructure.persistence.planning import (
    PlanningTelemetryAdapter,
    SQLAlchemyPlanRepository,
)
from inti.infrastructure.storage import LocalArtifactStorage
from inti.main import create_app
from inti.presentation.dependencies import PlanningServices, Services


@pytest.fixture
def observation() -> Observation:
    return Observation(
        source_url="http://127.0.0.1:8001/", page_title="Inventory", width=1440, height=900
    )


@pytest.fixture
def repository(tmp_path: Path) -> SQLAlchemyObservationRepository:
    repository = SQLAlchemyObservationRepository(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(repository.engine)
    yield repository
    repository.engine.dispose()


@pytest.fixture
def services(
    tmp_path: Path, repository: SQLAlchemyObservationRepository, observation: Observation
) -> Services:
    settings = ConfigurationProvider(
        _env_file=None, artifact_dir=tmp_path / "artifacts", meta_api_key=""
    )
    storage = LocalArtifactStorage(settings.artifact_dir)
    browser = AsyncMock()
    browser.capture.return_value = observation
    browser.available.return_value = True
    return Services(settings, repository, storage, browser, MetaModelAPIAdapter(settings, storage))


@pytest.fixture
def client(services: Services) -> TestClient:
    with TestClient(create_app(services)) as client:
        yield client


@pytest.fixture
def planning_scene(observation):
    # Explicit test fixture; the runtime never constructs synthetic model output.
    return VisualScene(
        observation.id,
        Viewport(1440, 900),
        (
            VisualElement(
                "search",
                ElementType.INPUT,
                "Search equipment",
                "Synthetic search control",
                BoundingBox(100, 150, 300, 45, CoordinateSystem.PIXELS),
                True,
                True,
                GroundingSource.MODEL_VISUAL,
                0.95,
            ),
            VisualElement(
                "save",
                ElementType.BUTTON,
                "Save changes",
                "Synthetic Save control",
                BoundingBox(1000, 150, 150, 45, CoordinateSystem.PIXELS),
                True,
                True,
                GroundingSource.MODEL_VISUAL,
                0.95,
            ),
            VisualElement(
                "status",
                ElementType.DROPDOWN,
                "EQ-001 status",
                "Synthetic status field",
                BoundingBox(1000, 300, 150, 45, CoordinateSystem.PIXELS),
                True,
                True,
                GroundingSource.MODEL_VISUAL,
                0.95,
            ),
        ),
        "TEST FIXTURE: synthetic inventory scene",
        (),
        model_usage=ModelUsage("test-only-model", "scene-test", 100, 30),
        captured_at=observation.timestamp,
    )


@pytest.fixture
def planning_intent():
    return TaskIntent(
        "Find asset EQ-001",
        "INTI Inventory",
        (),
        "EQ-001 is visually identified",
        (),
        ("Find EQ-001",),
        model_usage=ModelUsage("test-only-model", "intent-test", 50, 20),
    )


@pytest.fixture
def planning_action():
    return PlannedAction(
        "step-1",
        PlannedActionType.INSPECT,
        ActionTarget("search", "Inspect inventory search", GroundingSource.MODEL_VISUAL, False),
        ActionParameters(evidence="Search equipment input is visibly present"),
        ("Inventory screenshot is available",),
        ("Visible search input is identified",),
        "Inspect the observed search control",
        RiskLevel.LOW,
    )


@pytest.fixture
def planning_services(services, observation, planning_scene, planning_intent, planning_action):
    plans = SQLAlchemyPlanRepository(services.repository.engine)
    visual_model, planner = AsyncMock(), AsyncMock()
    visual_model.interpret.return_value = planning_scene
    planner.interpret_intent.return_value = planning_intent
    planner.generate.return_value = ((planning_action,), ModelUsage("test-only-model", "plan-test"))
    policy = PlanningPolicy((observation.source_url,))
    visual = InterpretVisualSceneUseCase(
        services.repository, services.storage, visual_model, VisualGroundingAdapter(), plans
    )
    services.planning = PlanningServices(
        plans,
        policy,
        visual,
        GenerateActionPlanUseCase(
            visual,
            InterpretTaskIntentUseCase(planner),
            planner,
            policy,
            plans,
            PlanningTelemetryAdapter(plans),
        ),
    )
    return services


@pytest.fixture
def planning_client(planning_services, observation):
    import asyncio

    asyncio.run(planning_services.repository.save(observation))
    asyncio.run(planning_services.storage.write(observation.id, b"\x89PNG\r\n\x1a\nTEST-FIXTURE"))
    with TestClient(create_app(planning_services)) as client:
        yield client
