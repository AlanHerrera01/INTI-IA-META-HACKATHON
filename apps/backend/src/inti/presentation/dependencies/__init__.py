from dataclasses import dataclass

from inti.application.execution import ExecutionOrchestrator
from inti.application.planning import (
    GenerateActionPlanUseCase,
    InterpretTaskIntentUseCase,
    InterpretVisualSceneUseCase,
)
from inti.domain.execution import ExecutionLimits
from inti.domain.execution_policy import ExecutionPolicy
from inti.domain.planning_policy import PlanningPolicy
from inti.domain.planning_ports import PlanRepositoryPort, PlanValidationPort
from inti.domain.ports import (
    ArtifactStoragePort,
    BrowserObservationPort,
    ObservationRepositoryPort,
    VisionModelPort,
)
from inti.infrastructure.browser import PlaywrightBrowserAdapter
from inti.infrastructure.browser.remote import RemoteBrowserWorker
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.grounding import VisualGroundingAdapter
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.infrastructure.meta.planning import MetaPlanningAdapter, MetaVisualReasoningAdapter
from inti.infrastructure.persistence import SQLAlchemyObservationRepository
from inti.infrastructure.persistence.execution import SQLAlchemyExecutionRepository
from inti.infrastructure.persistence.planning import (
    PlanningTelemetryAdapter,
    SQLAlchemyPlanRepository,
)
from inti.infrastructure.storage import LocalArtifactStorage


@dataclass
class Services:
    settings: ConfigurationProvider
    repository: ObservationRepositoryPort
    storage: ArtifactStoragePort
    browser: BrowserObservationPort
    model: VisionModelPort
    planning: "PlanningServices | None" = None
    execution: ExecutionOrchestrator | None = None


@dataclass
class PlanningServices:
    repository: PlanRepositoryPort
    validator: PlanValidationPort
    visual: InterpretVisualSceneUseCase
    generate: GenerateActionPlanUseCase


def build_services(settings: ConfigurationProvider) -> Services:
    storage = LocalArtifactStorage(settings.artifact_dir, settings.max_artifact_bytes)
    repository = SQLAlchemyObservationRepository(settings.database_url.get_secret_value())
    meta = MetaModelAPIAdapter(settings, storage)
    plans = SQLAlchemyPlanRepository(repository.engine)
    policy = PlanningPolicy(
        tuple(settings.browser_allowed_urls),
        settings.planning_max_steps,
        settings.planning_ttl_seconds,
        settings.planning_min_confidence,
    )
    visual = InterpretVisualSceneUseCase(
        repository,
        storage,
        MetaVisualReasoningAdapter(meta, storage, settings),
        VisualGroundingAdapter(),
        plans,
    )
    planner = MetaPlanningAdapter(meta, settings)
    planning = PlanningServices(
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
            settings.planning_timeout_seconds,
        ),
    )
    execution = None
    if settings.execution_enabled:
        worker = RemoteBrowserWorker(settings)
        limits = ExecutionLimits(
            settings.execution_max_actions,
            settings.execution_max_duration_seconds,
            settings.execution_action_timeout_seconds,
            settings.execution_max_navigation_count,
        )
        execution = ExecutionOrchestrator(
            SQLAlchemyExecutionRepository(repository.engine),
            plans,
            repository,
            storage,
            worker,
            worker,
            ExecutionPolicy(
                policy, tuple(settings.browser_allowed_urls), limits, settings.planning_ttl_seconds
            ),
            MetaVisualReasoningAdapter(meta, storage, settings),
            settings.execution_max_concurrent_sessions,
        )
    return Services(
        settings,
        repository,
        storage,
        PlaywrightBrowserAdapter(settings, storage),
        meta,
        planning,
        execution,
    )
