from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response

from inti import __version__
from inti.application.use_cases import (
    AnalyzeObservationUseCase,
    CaptureObservationUseCase,
    GetSystemStatusUseCase,
)
from inti.domain.exceptions import NotFoundError
from inti.presentation.dependencies import Services
from inti.presentation.execution_auth import require_operator
from inti.presentation.schemas import (
    AnalysisResponse,
    AnalyzeRequest,
    CaptureRequest,
    ObservationResponse,
)

router = APIRouter(prefix="/api/v1")


def services(request: Request) -> Services:
    result: Services = request.app.state.services
    return result


Container = Annotated[Services, Depends(services)]


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@router.get("/system/status")
async def system_status(svc: Container) -> dict[str, str | bool]:
    return await GetSystemStatusUseCase(svc.repository, svc.browser).execute()


@router.get("/models/status")
async def model_status(svc: Container) -> dict[str, str | bool | None]:
    return await svc.model.status()


@router.post("/observations/capture", status_code=201)
async def capture(payload: CaptureRequest, svc: Container) -> ObservationResponse:
    observation = await CaptureObservationUseCase(svc.browser, svc.repository, svc.storage).execute(
        payload.url or svc.settings.demo_url, payload.width, payload.height
    )
    return ObservationResponse.from_entity(observation)


@router.get("/observations")
async def list_observations(
    svc: Container, limit: Annotated[int, Query(ge=1, le=100)] = 20
) -> list[ObservationResponse]:
    return [ObservationResponse.from_entity(item) for item in await svc.repository.latest(limit)]


@router.get("/observations/{id}")
async def get_observation(id: UUID, svc: Container, request: Request) -> ObservationResponse:
    observation = await svc.repository.get(id)
    if observation is None:
        raise NotFoundError("Observation not found")
    if observation.restricted:
        require_operator(svc.settings, request.headers.get("Authorization"))
    return ObservationResponse.from_entity(observation)


@router.get("/observations/{id}/screenshot")
async def screenshot(id: UUID, svc: Container, request: Request) -> Response:
    observation = await svc.repository.get(id)
    if observation is None:
        raise NotFoundError("Observation not found")
    if observation.restricted:
        require_operator(svc.settings, request.headers.get("Authorization"))
    return Response(
        await svc.storage.read(id),
        media_type="image/png",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"},
    )


@router.post("/observations/{id}/analyze")
async def analyze(
    id: UUID, payload: AnalyzeRequest, svc: Container, request: Request
) -> AnalysisResponse:
    observation = await svc.repository.get(id)
    if observation and observation.restricted:
        require_operator(svc.settings, request.headers.get("Authorization"))
    result = await AnalyzeObservationUseCase(svc.model, svc.repository).execute(
        id, payload.instruction
    )
    return AnalysisResponse.model_validate(result)
