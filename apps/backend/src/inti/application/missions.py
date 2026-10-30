"""Product coordination. No fixture reasoner or implicit approval is installed here."""

import asyncio
from dataclasses import replace
from typing import Any
from uuid import UUID, uuid4

from inti.application.execution import ExecutionOrchestrator
from inti.application.planning import GenerateActionPlanUseCase
from inti.application.sandbox_recipe import SandboxRecipe
from inti.application.use_cases import CaptureObservationUseCase
from inti.domain.exceptions import ConfigurationError, NotFoundError
from inti.domain.execution import (
    ActionContract,
    BrowserCheck,
    BrowserTarget,
    CheckKind,
    ExecutableAction,
    ExecutionBundle,
    ExecutionError,
    ExecutionEvent,
    GroundingMode,
)
from inti.domain.inventory_objective import matches_inventory_objective
from inti.domain.missions import (
    DemoControlPort,
    Mission,
    MissionMode,
    MissionRepositoryPort,
    PreparationStatus,
)
from inti.domain.planning import PlannedActionType, RiskLevel
from inti.domain.ports import VisionModelPort
from inti.domain.verification_ports import VerificationRepositoryPort


class MissionService:
    def __init__(
        self,
        repository: MissionRepositoryPort,
        execution: ExecutionOrchestrator,
        capture: CaptureObservationUseCase,
        generator: GenerateActionPlanUseCase | None,
        model: VisionModelPort,
        demo: DemoControlPort | None,
        demo_url: str,
        model_calls_enabled: bool = False,
        verification_repository: VerificationRepositoryPort | None = None,
    ) -> None:
        self.repository, self.execution, self.capture, self.generator = (
            repository,
            execution,
            capture,
            generator,
        )
        self.model, self.demo, self.demo_url = model, demo, demo_url
        self.model_calls_enabled = model_calls_enabled
        self.verification_repository = verification_repository
        self.gate = asyncio.Lock()

    async def get(self, id: UUID) -> Mission:
        result = await self.repository.get(id)
        if result is None:
            raise NotFoundError("Mission not found")
        return result

    async def _save(self, old: Mission, new: Mission) -> Mission:
        await self.repository.save(new, old.version)
        return new

    async def create(self, objective: str, mode: MissionMode, actor: str) -> Mission:
        if mode == MissionMode.AUTHORED_DEMO and not matches_inventory_objective(
            objective, "PC-104", "Operational"
        ):
            raise ExecutionError(
                "DEMO_OBJECTIVE_UNSUPPORTED",
                "Authored demo supports PC-104 to Operational only; other goals need Meta",
            )
        mission = Mission(objective.strip(), mode, actor)
        await self.repository.save(mission, None)
        return mission

    async def prepare(self, id: UUID) -> Mission:
        async with self.gate:
            mission = await self.get(id)
            if mission.plan_id:
                return mission
            if mission.status == PreparationStatus.PREPARING:
                raise ExecutionError("MISSION_BUSY", "Mission preparation is already running")
            mission = await self._save(
                mission, mission.changed(status=PreparationStatus.PREPARING, error_code=None)
            )
            try:
                if mission.mode == MissionMode.AUTHORED_DEMO:
                    bundle = await SandboxRecipe(self.execution, self.demo_url).prepare(
                        mission.id, mission.objective
                    )
                    return await self._save(
                        mission,
                        mission.changed(
                            status=PreparationStatus.PLAN_READY,
                            plan_id=bundle.session.plan_id,
                            observation_id=bundle.manifest.plan_snapshot.plan.observation_id,
                            execution_id=bundle.session.id,
                        ),
                    )
                if not self.model_calls_enabled:
                    raise ExecutionError(
                        "MODEL_CALLS_DISABLED",
                        "Real model calls are disabled. Authored demo is a separate explicit mode",
                    )
                if not (await self.model.status())["configured"] or self.generator is None:
                    raise ConfigurationError("Meta is not configured for live planning")
                observation = await self.capture.execute(self.demo_url)
                mission = await self._save(mission, mission.changed(observation_id=observation.id))
                plan = await self.generator.execute(
                    observation.id, mission.objective, (), uuid4(), mission.id
                )
                return await self._save(
                    mission,
                    mission.changed(status=PreparationStatus.PLAN_READY, plan_id=plan.plan.id),
                )
            except BaseException as exc:
                latest = await self.get(id)
                await asyncio.shield(
                    self._save(
                        latest,
                        latest.changed(
                            status=PreparationStatus.FAILED,
                            error_code=getattr(exc, "code", "MISSION_PREPARATION_FAILED"),
                        ),
                    )
                )
                raise

    async def prepare_execution(
        self, id: UUID, contracts: tuple[ActionContract, ...], mode: GroundingMode
    ) -> Mission:
        async with self.gate:
            mission = await self.get(id)
            if mission.execution_id:
                raise ExecutionError(
                    "MISSION_EXECUTION_EXISTS", "This mission already has an execution"
                )
            if not mission.plan_id:
                raise ExecutionError("PLAN_REQUIRED", "Prepare a plan first")
            plan = await self.execution.plans.get(mission.plan_id)
            if plan is None or plan.plan.task_id != mission.id:
                raise ExecutionError(
                    "MISSION_IDENTITY_MISMATCH", "Plan identity does not match mission"
                )
            bundle = await self.execution.create(mission.plan_id, contracts, self.demo_url, mode)
            return await self._save(mission, mission.changed(execution_id=bundle.session.id))

    async def detail(self, id: UUID) -> dict[str, Any]:
        mission = await self.get(id)
        plan = await self.execution.plans.get(mission.plan_id) if mission.plan_id else None
        execution = await self.execution.get(mission.execution_id) if mission.execution_id else None
        events = await self.execution.repository.events(execution.session.id) if execution else []
        phase = execution.session.status.value if execution else mission.status.value
        return dict(mission=mission, plan=plan, execution=execution, phase=phase, events=events)

    async def _demo(self) -> DemoControlPort:
        if self.demo is None:
            raise ConfigurationError("Demo controls are disabled in this environment")
        return self.demo

    async def reset(self, store_id: UUID) -> dict[str, Any]:
        if self.gate.locked() or self.execution.start_lock.locked():
            raise ExecutionError("DEMO_BUSY", "Wait for mission preparation before reset")
        async with self.gate, self.execution.start_lock:
            if self.execution.tasks:
                raise ExecutionError(
                    "DEMO_BUSY", "Stop active executions before resetting demo data"
                )
            if self.verification_repository and await self.verification_repository.unfinished():
                raise ExecutionError("DEMO_BUSY", "Wait for active verification before resetting")
            unfinished = await self.execution.repository.unfinished()
            if unfinished:
                raise ExecutionError(
                    "DEMO_BUSY", "Stop active executions before resetting demo data"
                )
            controller = await self._demo()
            state = await controller.status()
            if state.get("store_id") != str(store_id):
                raise ExecutionError(
                    "DEMO_STORE_CHANGED", "Confirm the current synthetic store identity"
                )
            result = await controller.reset(store_id)
            previous, _ = await self.execution.repository.list_executions(0, 100)
            for bundle in previous:
                await self.execution.browser.close_execution(bundle.session.id)
            return result

    async def arm(self, id: UUID) -> Mission:
        async with self.gate:
            mission = await self.get(id)
            if not matches_inventory_objective(mission.objective, "PC-104", "Operational"):
                raise ExecutionError("DEMO_SCOPE", "This fault scenario only applies to PC-104")
            await self._demo()
            if not self.model_calls_enabled or not (await self.model.status())["configured"]:
                raise ExecutionError(
                    "LIVE_RECOVERY_BLOCKED",
                    "Live recovery requires enabled Meta calls and model access",
                )
            if not self.execution.recovery or not mission.execution_id:
                raise ExecutionError(
                    "RECOVERY_REQUIRED", "Prepare execution with recovery enabled first"
                )
            execution = await self.execution.get(mission.execution_id)
            if execution.session.status not in {"AWAITING_APPROVAL", "READY"}:
                raise ExecutionError("DEMO_ARM_STATE", "Arm the fault before starting execution")
            return await self._save(mission, mission.changed(fault_armed=True))

    async def before_dispatch(self, bundle: ExecutionBundle, action: ExecutableAction) -> None:
        if (
            action.action_type != PlannedActionType.CLICK
            or action.risk_level != RiskLevel.HIGH
            or not action.target
            or action.target.role != "button"
            or action.target.name != "Save PC-104"
        ):
            return
        mission = await self.repository.for_execution(bundle.session.id)
        if not mission or not mission.fault_armed or mission.fault_injected:
            return
        if not self.model_calls_enabled:
            raise ExecutionError("MODEL_CALLS_DISABLED", "Live fault demonstration is disabled")
        if not bundle.browser_session:
            raise ExecutionError("DEMO_BROWSER_MISSING", "Demo browser is not available")
        # External scenario control changes the real app; the agent receives no admin capability.
        await (await self._demo()).inject()
        async with asyncio.timeout(3):
            while not await self.execution.browser.checks(
                bundle.browser_session.id,
                (BrowserCheck(CheckKind.VISIBLE, BrowserTarget("button", "Update Record")),),
                bundle.manifest.grounding_mode,
            ):
                await asyncio.sleep(0.05)
        await self._save(mission, mission.changed(fault_injected=True))
        async with self.execution._lock(bundle.session.id):
            current = await self.execution.get(bundle.session.id)
            await self.execution.repository.commit(
                replace(current, session=current.session.change()),
                current.session.version,
                (
                    ExecutionEvent(
                        bundle.session.id,
                        "demo_fault_activated",
                        payload={
                            "scenario": "INTI-DEMO-001",
                            "seed": 42,
                            "mission_id": str(mission.id),
                        },
                    ),
                ),
            )

    async def recover_interrupted(self) -> None:
        offset = 0
        while True:
            items, total = await self.repository.list(offset, 100)
            for mission in items:
                if mission.status == PreparationStatus.PREPARING:
                    await self._save(
                        mission,
                        mission.changed(
                            status=PreparationStatus.FAILED, error_code="PROCESS_RESTART"
                        ),
                    )
            offset += len(items)
            if offset >= total or not items:
                break
