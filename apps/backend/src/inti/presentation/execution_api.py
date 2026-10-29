import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from inti.application.execution import ExecutionOrchestrator
from inti.application.sandbox_recipe import SandboxRecipe
from inti.domain.exceptions import ConfigurationError
from inti.domain.execution import (
    TERMINAL,
    ActionContract,
    ActionExecutionResult,
    ExecutionBundle,
    ExecutionEvent,
    GroundingMode,
)
from inti.presentation.api import Container
from inti.presentation.dependencies import Services
from inti.presentation.execution_auth import require_operator

router = APIRouter(tags=["Authorized sandbox execution"])


class CreateExecutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan_id: UUID
    grounding_mode: GroundingMode = GroundingMode.HYBRID_DOM
    contracts: list[ActionContract] = Field(min_length=1, max_length=50)


class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    manifest_digest: str = Field(min_length=64, max_length=64)
    scope: str = Field(pattern="^(plan|high_risk)$")
    action_ids: list[UUID] = Field(default_factory=list, max_length=50)


class ExecutionPage(BaseModel):
    items: list[ExecutionBundle]
    total: int
    offset: int
    limit: int


def operator(request: Request, services: Container) -> str:
    return require_operator(services.settings, request.headers.get("Authorization"))


def executor(
    services: Container, approved_operator: Annotated[str, Depends(operator)]
) -> ExecutionOrchestrator:
    if services.execution is None:
        raise ConfigurationError("Execution services are not configured")
    return services.execution


Executor = Annotated[ExecutionOrchestrator, Depends(executor)]
Operator = Annotated[str, Depends(operator)]


@router.post("/api/v1/executions", status_code=201)
async def create(
    payload: CreateExecutionRequest, service: Executor, services: Container
) -> ExecutionBundle:
    return await service.create(
        payload.plan_id,
        tuple(payload.contracts),
        services.settings.demo_url,
        payload.grounding_mode,
    )


@router.post("/api/v1/executions/demo/prepare", status_code=201)
async def demo(service: Executor, services: Container) -> ExecutionBundle:
    return await SandboxRecipe(service, services.settings.demo_url).prepare()


@router.post("/api/v1/executions/{id}/approve")
async def approve(
    id: UUID, payload: ApprovalRequest, service: Executor, actor: Operator
) -> ExecutionBundle:
    return await service.approve(
        id, payload.manifest_digest, payload.scope, tuple(payload.action_ids), actor
    )


@router.post("/api/v1/executions/{id}/start", status_code=202)
async def start(id: UUID, service: Executor) -> ExecutionBundle:
    return await service.start(id)


@router.post("/api/v1/executions/{id}/pause")
async def pause(id: UUID, service: Executor) -> ExecutionBundle:
    return await service.pause(id)


@router.post("/api/v1/executions/{id}/resume")
async def resume(id: UUID, service: Executor) -> ExecutionBundle:
    return await service.resume(id)


@router.post("/api/v1/executions/{id}/cancel")
async def cancel(id: UUID, service: Executor) -> ExecutionBundle:
    return await service.cancel(id)


@router.get("/api/v1/executions/{id}")
async def get(id: UUID, service: Executor) -> ExecutionBundle:
    return await service.get(id)


@router.get("/api/v1/executions/{id}/actions")
async def actions(id: UUID, service: Executor) -> tuple[ActionExecutionResult, ...]:
    return (await service.get(id)).results


@router.get("/api/v1/executions/{id}/events")
async def events(
    id: UUID, service: Executor, after: Annotated[int, Query(ge=0)] = 0
) -> list[ExecutionEvent]:
    await service.get(id)
    return await service.repository.events(id, after)


@router.get("/api/v1/executions")
async def history(
    service: Executor,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ExecutionPage:
    items, total = await service.repository.list_executions(offset, limit)
    return ExecutionPage(items=items, total=total, offset=offset, limit=limit)


@router.websocket("/ws/executions/{id}")
async def stream(websocket: WebSocket, id: UUID) -> None:
    services: Services = websocket.app.state.services
    origin = websocket.headers.get("origin")
    if origin and origin not in services.settings.cors_origins:
        await websocket.close(code=4403)
        return
    await websocket.accept()
    try:
        auth = await asyncio.wait_for(websocket.receive_json(), timeout=5)
        require_operator(
            services.settings,
            f"Bearer {auth.get('token', '')}",
            services.settings.execution_enabled or services.settings.verification_enabled,
        )
        service = services.execution
        reader = (
            service.repository
            if service
            else services.verification.executions
            if services.verification
            else None
        )
        if reader is None:
            await websocket.close(code=4403)
            return
        cursor = max(0, int(auth.get("after", 0)))
        if await reader.get(id) is None:
            await websocket.close(code=4401)
            return
        while True:
            batch = await reader.events(id, cursor)
            for event in batch:
                await websocket.send_json(
                    TypeAdapter(ExecutionEvent).dump_python(event, mode="json")
                )
                cursor = event.sequence
            current = await reader.get(id)
            verifying = (
                await services.verification.active_for_execution(id)
                if services.verification
                else False
            )
            if current and current.session.status in TERMINAL and not batch and not verifying:
                await websocket.close(code=1000)
                return
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        return
    except Exception:
        await websocket.close(code=4401)
