from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from inti.application.missions import MissionService
from inti.domain.exceptions import ConfigurationError
from inti.domain.execution import ActionContract, ExecutionBundle, ExecutionEvent, GroundingMode
from inti.domain.missions import Mission, MissionMode
from inti.domain.planning import PlanningResult
from inti.domain.recovery import RecoveryBundle
from inti.domain.verification import VerificationBundle
from inti.presentation.api import Container
from inti.presentation.execution_auth import require_operator

router = APIRouter(prefix="/api/v1", tags=["Mission Control"])


def operator(request: Request, services: Container) -> str:
    return require_operator(services.settings, request.headers.get("Authorization"))


Operator = Annotated[str, Depends(operator)]


def service(services: Container, actor: Operator) -> MissionService:
    if services.missions is None:
        raise ConfigurationError("Mission Control requires execution services")
    return services.missions


Missions = Annotated[MissionService, Depends(service)]


class MissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    objective: str = Field(min_length=1, max_length=2000)
    target_application: Literal["inventory"] = "inventory"
    mode: MissionMode = MissionMode.META


class ExecutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contracts: list[ActionContract] = Field(min_length=1, max_length=50)
    grounding_mode: GroundingMode = GroundingMode.HYBRID_DOM


class MissionPage(BaseModel):
    items: list[Mission]
    total: int


class MissionDetail(BaseModel):
    mission: Mission
    plan: PlanningResult | None
    execution: ExecutionBundle | None
    phase: str
    events: list[ExecutionEvent]
    recoveries: list[RecoveryBundle]
    verifications: list[VerificationBundle]
    verification_report: dict[str, Any] | None


class ResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    store_id: UUID
    confirmation: Literal["RESET PC-104"]


@router.post("/missions", status_code=201)
async def create(payload: MissionRequest, service: Missions, actor: Operator) -> Mission:
    return await service.create(payload.objective, payload.mode, actor)


@router.get("/missions")
async def history(
    service: Missions,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> MissionPage:
    items, total = await service.repository.list(offset, limit)
    return MissionPage(items=items, total=total)


@router.get("/missions/{id}")
async def detail(id: UUID, service: Missions, services: Container) -> MissionDetail:
    data = await service.detail(id)
    recoveries = []
    verifications: list[VerificationBundle] = []
    report = None
    execution = data["execution"]
    if execution:
        if services.recovery:
            for result in execution.results:
                found = await services.recovery.repository.for_failure(
                    execution.session.id, result.action_id
                )
                if found:
                    recoveries.append(found)
        if services.verification:
            verifications, _ = await services.verification.repository.list_verifications(
                0, 20, execution.session.id
            )
            if verifications:
                report = await services.verification.report(verifications[0].session.id)
                data["phase"] = verifications[0].session.status.value
    return MissionDetail(
        **data, recoveries=recoveries, verifications=verifications, verification_report=report
    )


@router.post("/missions/{id}/prepare")
async def prepare(id: UUID, service: Missions) -> Mission:
    return await service.prepare(id)


@router.post("/missions/{id}/execution", status_code=201)
async def prepare_execution(id: UUID, payload: ExecutionRequest, service: Missions) -> Mission:
    return await service.prepare_execution(id, tuple(payload.contracts), payload.grounding_mode)


@router.post("/missions/{id}/demo-fault")
async def arm(id: UUID, service: Missions) -> Mission:
    return await service.arm(id)


def require_demo_controls(services: Container) -> None:
    if not services.settings.demo_controls_enabled:
        raise ConfigurationError("Demo controls are disabled in this environment")


@router.get("/demo/status")
async def demo_status(service: Missions, services: Container) -> dict[str, Any]:
    require_demo_controls(services)
    return await (await service._demo()).status()


@router.post("/demo/reset")
async def reset(payload: ResetRequest, service: Missions, services: Container) -> dict[str, Any]:
    require_demo_controls(services)
    return await service.reset(payload.store_id)


@router.get("/mission-control")
async def overview(service: Missions, services: Container) -> dict[str, Any]:
    missions, total = await service.repository.list(0, 8)
    executions, _ = await service.execution.repository.list_executions(0, 6)
    verifications: list[VerificationBundle] = []
    if services.verification:
        verifications, _ = await services.verification.repository.list_verifications(0, 6)
    activity: list[dict[str, Any]] = []

    def add(source: str, event: Any) -> None:
        activity.append(
            {
                "id": str(event.id),
                "event_type": getattr(event, "event_type", None) or getattr(event, "kind", "event"),
                "timestamp": event.timestamp.isoformat(),
                "source": source,
            }
        )

    for execution in executions:
        for execution_event in (await service.execution.repository.events(execution.session.id))[
            -8:
        ]:
            add("execution", execution_event)
    for mission in missions:
        if mission.plan_id:
            for planning_event in (await service.execution.plans.events(mission.plan_id))[-4:]:
                add("planning", planning_event)
    if services.recovery:
        recoveries, _ = await services.recovery.repository.list_recoveries(0, 6)
        for recovery_bundle in recoveries:
            for recovery_event in (
                await services.recovery.repository.events(recovery_bundle.session.id)
            )[-4:]:
                add("recovery", recovery_event)
    if services.verification:
        for verification_bundle in verifications:
            for verification_event in (
                await services.verification.repository.events(verification_bundle.session.id)
            )[-4:]:
                add("verification", verification_event)
    activity.sort(key=lambda item: item["timestamp"], reverse=True)
    latest_verdict = None
    if services.verification and verifications:
        latest_report = await services.verification.report(verifications[0].session.id)
        latest_verdict = latest_report["effective_verdict"]
    model_configured = bool((await services.model.status())["configured"])
    return {
        "missions": missions,
        "mission_count": total,
        "active_executions": len(service.execution.tasks),
        "executions": executions,
        "recent_verifications": verifications,
        "latest_verdict": latest_verdict,
        "recent_events": activity[:20],
        "model_calls_enabled": services.settings.mission_model_calls_enabled,
        "demo_controls_enabled": services.settings.demo_controls_enabled,
        "features": {
            "execution_enabled": services.settings.execution_enabled,
            "verification_enabled": services.settings.verification_enabled,
            "recovery_enabled": services.settings.recovery_enabled,
            "recovery_live_model_enabled": (
                services.settings.recovery_enabled
                and services.settings.mission_model_calls_enabled
                and model_configured
            ),
            "demo_controls_enabled": services.settings.demo_controls_enabled,
        },
    }
