from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from inti.application.context import correlation_id
from inti.application.planning import (
    GetActionPlanUseCase,
    ListActionPlansUseCase,
    ValidateActionPlanUseCase,
)
from inti.domain.exceptions import ConfigurationError
from inti.domain.planning import PlanningEvent, PlanningResult, VisualScene
from inti.presentation.api import Container
from inti.presentation.dependencies import PlanningServices

router = APIRouter(prefix="/api/v1", tags=["Planning only"])


class SceneRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    observation_id: UUID
    goal: str | None = Field(default=None, min_length=1, max_length=2000)


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    observation_id: UUID
    user_goal: str = Field(min_length=1, max_length=2000)
    constraints: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(
        default_factory=list, max_length=20
    )


class PlanPage(BaseModel):
    items: list[PlanningResult]
    total: int
    offset: int
    limit: int


def planning_services(services: Container) -> PlanningServices:
    if services.planning is None:
        raise ConfigurationError("Planning services are not configured")
    return services.planning


Planning = Annotated[PlanningServices, Depends(planning_services)]


@router.post("/scenes/interpret")
async def interpret_scene(payload: SceneRequest, services: Planning) -> VisualScene:
    return await services.visual.execute(payload.observation_id, payload.goal)


@router.post("/plans/generate", status_code=201)
async def generate_plan(payload: GenerateRequest, services: Planning) -> PlanningResult:
    return await services.generate.execute(
        payload.observation_id,
        payload.user_goal,
        tuple(payload.constraints),
        correlation_id.get() or uuid4(),
    )


@router.post("/plans/{id}/validate")
async def validate_plan(id: UUID, services: Planning) -> PlanningResult:
    return await ValidateActionPlanUseCase(services.repository, services.validator).execute(
        id, correlation_id.get() or uuid4()
    )


@router.get("/plans/{id}")
async def get_plan(id: UUID, services: Planning) -> PlanningResult:
    return await GetActionPlanUseCase(services.repository).execute(id)


@router.get("/plans")
async def list_plans(
    services: Planning,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PlanPage:
    items, total = await ListActionPlansUseCase(services.repository).execute(offset, limit)
    return PlanPage(items=items, total=total, offset=offset, limit=limit)


@router.get("/plans/{id}/events")
async def plan_events(id: UUID, services: Planning) -> list[PlanningEvent]:
    await GetActionPlanUseCase(services.repository).execute(id)
    return await services.repository.events(id)
