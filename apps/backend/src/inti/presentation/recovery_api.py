from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from inti.application.recovery import RecoveryOrchestrator
from inti.domain.exceptions import ConfigurationError
from inti.domain.recovery import RecoveryAttempt, RecoveryBundle, RecoveryEvent
from inti.presentation.api import Container
from inti.presentation.execution_auth import require_operator

router = APIRouter(prefix="/api/v1/recoveries", tags=["Controlled recovery"])


def operator(request: Request, services: Container) -> str:
    return require_operator(
        services.settings, request.headers.get("Authorization"), services.settings.recovery_enabled
    )


def recovery(services: Container, actor: Annotated[str, Depends(operator)]) -> RecoveryOrchestrator:
    if services.recovery is None:
        raise ConfigurationError("Recovery services are not configured")
    return services.recovery


Recovery = Annotated[RecoveryOrchestrator, Depends(recovery)]
Operator = Annotated[str, Depends(operator)]


class RecoveryPage(BaseModel):
    items: list[RecoveryBundle]
    total: int
    offset: int
    limit: int


class RecoveryApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    manifest_digest: str = Field(min_length=64, max_length=64)
    scope: str = Field(pattern="^(plan|high_risk)$")
    action_ids: list[UUID] = Field(default_factory=list, max_length=10)


@router.get("")
async def history(
    service: Recovery,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> RecoveryPage:
    items, total = await service.repository.list_recoveries(offset, limit)
    return RecoveryPage(items=items, total=total, offset=offset, limit=limit)


@router.get("/{id}")
async def get(id: UUID, service: Recovery) -> RecoveryBundle:
    return await service.get(id)


@router.get("/{id}/attempts")
async def attempts(id: UUID, service: Recovery) -> tuple[RecoveryAttempt, ...]:
    return (await service.get(id)).attempts


@router.get("/{id}/events")
async def events(
    id: UUID, service: Recovery, after: Annotated[int, Query(ge=0)] = 0
) -> list[RecoveryEvent]:
    await service.get(id)
    return await service.repository.events(id, after)


@router.post("/{id}/approve")
async def approve(
    id: UUID, payload: RecoveryApproval, service: Recovery, actor: Operator
) -> RecoveryBundle:
    return await service.approve(
        id, payload.manifest_digest, payload.scope, tuple(payload.action_ids), actor
    )


@router.post("/{id}/cancel")
async def cancel(id: UUID, service: Recovery) -> RecoveryBundle:
    return await service.cancel(id)


@router.post("/{id}/retry")
async def retry(id: UUID, service: Recovery) -> RecoveryBundle:
    return await service.retry(id)
