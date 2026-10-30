from dataclasses import dataclass

from inti.application.execution import ExecutionOrchestrator
from inti.application.missions import MissionService
from inti.application.planning import (
    GenerateActionPlanUseCase,
    InterpretTaskIntentUseCase,
    InterpretVisualSceneUseCase,
)
from inti.application.recovery import RecoveryOrchestrator
from inti.application.use_cases import CaptureObservationUseCase
from inti.application.verification import IndependentVerificationOrchestrator
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
from inti.domain.recovery import RecoveryBudget
from inti.infrastructure.browser import PlaywrightBrowserAdapter
from inti.infrastructure.browser.remote import RemoteBrowserWorker
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.demo_control import LocalDemoControl
from inti.infrastructure.grounding import VisualGroundingAdapter
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.infrastructure.meta.planning import MetaPlanningAdapter, MetaVisualReasoningAdapter
from inti.infrastructure.meta.recovery import MetaRecoveryAdapter
from inti.infrastructure.persistence import SQLAlchemyObservationRepository
from inti.infrastructure.persistence.execution import SQLAlchemyExecutionRepository
from inti.infrastructure.persistence.missions import SQLAlchemyMissionRepository
from inti.infrastructure.persistence.planning import (
    PlanningTelemetryAdapter,
    SQLAlchemyPlanRepository,
)
from inti.infrastructure.persistence.recovery import SQLAlchemyRecoveryRepository
from inti.infrastructure.persistence.verification import SQLAlchemyVerificationRepository
from inti.infrastructure.storage import LocalArtifactStorage
from inti.infrastructure.verification_evidence import (
    EvidenceIntegrityAdapter,
    InventoryEvidenceCollector,
    LocalEvidenceStorage,
    ReadOnlyInventoryAdapter,
)


@dataclass
class Services:
    settings: ConfigurationProvider
    repository: ObservationRepositoryPort
    storage: ArtifactStoragePort
    browser: BrowserObservationPort
    model: VisionModelPort
    planning: "PlanningServices | None" = None
    execution: ExecutionOrchestrator | None = None
    verification: IndependentVerificationOrchestrator | None = None
    recovery: RecoveryOrchestrator | None = None
    missions: MissionService | None = None


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
    verification = None
    if settings.verification_enabled:
        verify_repository = SQLAlchemyVerificationRepository(repository.engine)
        state = ReadOnlyInventoryAdapter(settings)
        verify_storage = LocalEvidenceStorage(
            settings.artifact_dir / "verification", settings.max_artifact_bytes
        )
        evidence_collector = InventoryEvidenceCollector(
            state, RemoteBrowserWorker(settings), settings
        )
        verification = IndependentVerificationOrchestrator(
            verify_repository,
            SQLAlchemyExecutionRepository(repository.engine),
            evidence_collector,
            state,
            verify_storage,
            EvidenceIntegrityAdapter(settings),
            verify_repository,
            settings.verification_readonly_url,
            settings.verification_timeout_seconds,
            settings.verification_auto_trigger,
        )
        if execution:
            execution.verification = verification
    recovery = None
    if execution and settings.recovery_enabled:
        worker = RemoteBrowserWorker(settings)
        recovery = RecoveryOrchestrator(
            SQLAlchemyRecoveryRepository(repository.engine),
            execution.repository,
            plans,
            repository,
            storage,
            worker,
            worker,
            execution.policy,
            MetaRecoveryAdapter(meta, storage),
            RecoveryBudget(
                settings.recovery_max_attempts,
                settings.recovery_max_duration_seconds,
                settings.recovery_max_model_calls,
                settings.recovery_max_actions,
                settings.recovery_max_tokens,
                settings.recovery_max_identical_failures,
            ),
        )
        execution.recovery = recovery
    missions = None
    if execution:
        missions = MissionService(
            SQLAlchemyMissionRepository(repository.engine),
            execution,
            CaptureObservationUseCase(
                PlaywrightBrowserAdapter(settings, storage), repository, storage
            ),
            planning.generate,
            meta,
            LocalDemoControl(settings) if settings.demo_controls_enabled else None,
            settings.demo_url,
            settings.mission_model_calls_enabled,
            verification.repository if verification else None,
        )
        if settings.demo_controls_enabled:
            execution.demo_controller = missions
    return Services(
        settings,
        repository,
        storage,
        PlaywrightBrowserAdapter(settings, storage),
        meta,
        planning,
        execution,
        verification,
        recovery,
        missions,
    )
