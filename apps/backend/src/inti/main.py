from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from inti.domain.exceptions import IntiError
from inti.infrastructure.config import ConfigurationProvider
from inti.presentation.api import router
from inti.presentation.dependencies import Services, build_services


def create_app(services: Services | None = None) -> FastAPI:
    settings = services.settings if services else ConfigurationProvider()
    app = FastAPI(title="INTI AI", version="0.1.0", description="Phase 1 · Visual observation")
    app.state.services = services or build_services(settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(IntiError)
    async def domain_error(request: Request, exc: IntiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": type(exc).__name__, "message": str(exc)}},
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "InternalError", "message": "Unexpected internal error"}},
        )

    app.include_router(router)
    return app


app = create_app()
