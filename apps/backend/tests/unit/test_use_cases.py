from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from inti.application.use_cases import (
    AnalyzeObservationUseCase,
    CaptureObservationUseCase,
    GetSystemStatusUseCase,
)
from inti.domain.entities import VisionAnalysis
from inti.domain.exceptions import NotFoundError


async def test_capture_saves(observation) -> None:
    browser, repository, storage = AsyncMock(), AsyncMock(), AsyncMock()
    browser.capture.return_value = observation
    result = await CaptureObservationUseCase(browser, repository, storage).execute(
        observation.source_url
    )
    assert result == observation
    repository.save.assert_awaited_once_with(observation)


async def test_capture_cleans_artifact_when_database_fails(observation) -> None:
    browser, repository, storage = AsyncMock(), AsyncMock(), AsyncMock()
    browser.capture.return_value = observation
    repository.save.side_effect = RuntimeError("db failed")
    with pytest.raises(RuntimeError):
        await CaptureObservationUseCase(browser, repository, storage).execute(
            observation.source_url
        )
    storage.delete.assert_awaited_once_with(observation.id)


async def test_analysis_persists_result(observation) -> None:
    model, repository = AsyncMock(), AsyncMock()
    repository.get.return_value = observation
    model.analyze_observation.return_value = VisionAnalysis("test-only", "Inventory visible")
    analysis = await AnalyzeObservationUseCase(model, repository).execute(
        observation.id, "Describe"
    )
    assert repository.save.await_args.args[0].analysis == analysis


async def test_analysis_missing_observation() -> None:
    model, repository = AsyncMock(), AsyncMock()
    repository.get.return_value = None
    with pytest.raises(NotFoundError):
        await AnalyzeObservationUseCase(model, repository).execute(uuid4(), "Describe")
    model.analyze_observation.assert_not_awaited()


async def test_status_reports_real_port_results() -> None:
    repository, browser = AsyncMock(), AsyncMock()
    repository.available.return_value = False
    browser.available.return_value = True
    status = await GetSystemStatusUseCase(repository, browser).execute()
    assert status["browser"] is True
    assert status["ready"] is False
