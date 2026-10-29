import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from inti import __version__
from inti.application.context import correlation_id
from inti.domain.exceptions import IntiError
from inti.infrastructure.config import ConfigurationProvider
from inti.presentation.api import router
from inti.presentation.dependencies import Services, build_services
from inti.presentation.execution_api import router as execution_router
from inti.presentation.planning_api import router as planning_router


def create_app(services: Services | None = None) -> FastAPI:
    inti_logger = logging.getLogger("inti")
    if not inti_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        inti_logger.addHandler(handler)
    inti_logger.setLevel(logging.INFO)
    inti_logger.propagate = False
    settings = services.settings if services else ConfigurationProvider()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        execution = app.state.services.execution
        if execution:
            await execution.recover()
        yield
        if execution:
            await execution.shutdown()

    app = FastAPI(
        title="INTI AI",
        version=__version__,
        description="Visual reasoning and authorized sandbox execution",
        lifespan=lifespan,
    )
    app.state.services = services or build_services(settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Correlation-ID", "Authorization"],
        expose_headers=["X-Correlation-ID"],
    )

    @app.middleware("http")
    async def correlate(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        try:
            id = (
                UUID(request.headers["X-Correlation-ID"])
                if "X-Correlation-ID" in request.headers
                else uuid4()
            )
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "error": {
                        "code": "InvalidCorrelationID",
                        "message": "X-Correlation-ID must be a UUID",
                    }
                },
            )
        token = correlation_id.set(id)
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = str(id)
            return response
        finally:
            correlation_id.reset(token)

    @app.exception_handler(IntiError)
    async def domain_error(request: Request, exc: IntiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {"code": getattr(exc, "code", type(exc).__name__), "message": str(exc)}
            },
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "InternalError", "message": "Unexpected internal error"}},
        )

    app.include_router(router)
    app.include_router(planning_router)
    app.include_router(execution_router)
    return app


app = create_app()
