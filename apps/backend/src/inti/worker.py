"""Private browser RPC service. Deploy without database, model keys or host mounts."""

import base64
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from inti.domain.entities import Observation
from inti.domain.execution import (
    ActionDispatchOutcome,
    BrowserSession,
    ExecutableAction,
    ExecutionError,
    ExecutionLimits,
    GroundingMode,
    ResolvedTarget,
    TargetQuery,
)
from inti.domain.planning import Viewport, VisualElement
from inti.infrastructure.browser.controller import BrowserSessionManager, PlaywrightActionExecutor
from inti.infrastructure.config import ConfigurationProvider


class OpenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    execution_id: UUID
    url: str
    viewport: Viewport
    limits: ExecutionLimits


class ObservationPacket(BaseModel):
    observation: Observation
    png_base64: str


class DispatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: ExecutableAction
    mode: GroundingMode
    observation: Observation
    screenshot_digest: str
    visual_resolution: ResolvedTarget | None = None


class CatalogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    queries: list[TargetQuery]


def create_worker(settings: ConfigurationProvider | None = None) -> FastAPI:
    config = settings or ConfigurationProvider()
    manager = BrowserSessionManager(config)
    executor = PlaywrightActionExecutor(manager)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        await manager.startup()
        yield
        await manager.shutdown()

    worker = FastAPI(
        title="INTI isolated browser worker",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    worker.state.manager = manager

    def authorize(authorization: str | None = Header(default=None)) -> None:
        expected = config.browser_worker_token.get_secret_value()
        if not expected or not secrets.compare_digest(
            (authorization or "").encode(), f"Bearer {expected}".encode()
        ):
            raise ExecutionError("WORKER_AUTH_REQUIRED", "Browser worker capability required")

    @worker.exception_handler(ExecutionError)
    async def execution_error(request: object, error: ExecutionError) -> JSONResponse:
        return JSONResponse(
            status_code=409, content={"error": {"code": error.code, "message": str(error)}}
        )

    @worker.exception_handler(Exception)
    async def safe_error(request: object, error: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=502,
            content={
                "error": {"code": "WORKER_FAILURE", "message": "Browser worker failed safely"}
            },
        )

    @worker.get("/health")
    async def health() -> dict[str, bool]:
        return {
            "ready": manager.playwright is not None,
            "configured": bool(config.browser_worker_token.get_secret_value()),
        }

    @worker.post("/sessions", dependencies=[Depends(authorize)])
    async def open_session(payload: OpenRequest) -> BrowserSession:
        if (
            payload.limits.max_actions > config.execution_max_actions
            or payload.limits.max_duration_seconds > config.execution_max_duration_seconds
            or payload.limits.action_timeout_seconds > config.execution_action_timeout_seconds
            or payload.limits.max_navigation_count > config.execution_max_navigation_count
        ):
            raise ExecutionError("LIMIT_DENIED", "Requested browser limits exceed worker limits")
        return await manager.open(
            payload.execution_id, payload.url, payload.viewport, payload.limits
        )

    @worker.get("/sessions/{id}", dependencies=[Depends(authorize)])
    async def info(id: UUID) -> BrowserSession:
        return await manager.info(id)

    @worker.post("/sessions/{id}/observe", dependencies=[Depends(authorize)])
    async def observe(id: UUID) -> ObservationPacket:
        observation, png = await manager.observe(id)
        return ObservationPacket(observation=observation, png_base64=base64.b64encode(png).decode())

    @worker.post("/sessions/{id}/act", dependencies=[Depends(authorize)])
    async def act(id: UUID, payload: DispatchRequest) -> ActionDispatchOutcome:
        return await executor.execute(
            id,
            payload.action,
            payload.mode,
            payload.observation,
            payload.screenshot_digest,
            payload.visual_resolution,
        )

    @worker.post("/sessions/{id}/catalog", dependencies=[Depends(authorize)])
    async def catalog(id: UUID, payload: CatalogRequest) -> tuple[VisualElement, ...]:
        return await manager.catalog(id, tuple(payload.queries))

    @worker.delete("/sessions/{id}", dependencies=[Depends(authorize)])
    async def close(id: UUID) -> Response:
        await manager.close(id)
        return Response(status_code=204)

    @worker.delete("/executions/{id}", dependencies=[Depends(authorize)])
    async def close_execution(id: UUID) -> Response:
        await manager.close_execution(id)
        return Response(status_code=204)

    return worker


app = create_worker()
