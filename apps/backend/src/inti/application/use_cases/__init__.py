from dataclasses import replace
from uuid import UUID

from inti.domain.entities import Observation, VisionAnalysis
from inti.domain.exceptions import NotFoundError
from inti.domain.ports import (
    ArtifactStoragePort,
    BrowserObservationPort,
    ObservationRepositoryPort,
    VisionModelPort,
)


class CaptureObservationUseCase:
    def __init__(
        self,
        browser: BrowserObservationPort,
        repository: ObservationRepositoryPort,
        storage: ArtifactStoragePort,
    ) -> None:
        self.browser, self.repository, self.storage = browser, repository, storage

    async def execute(self, url: str, width: int = 1440, height: int = 900) -> Observation:
        observation = await self.browser.capture(url, width, height)
        try:
            await self.repository.save(observation)
        except Exception:
            await self.storage.delete(observation.id)
            raise
        return observation


class AnalyzeObservationUseCase:
    def __init__(self, model: VisionModelPort, repository: ObservationRepositoryPort) -> None:
        self.model, self.repository = model, repository

    async def execute(self, id: UUID, instruction: str) -> VisionAnalysis:
        observation = await self.repository.get(id)
        if observation is None:
            raise NotFoundError("Observation not found")
        analysis = await self.model.analyze_observation(observation, instruction)
        await self.repository.save(replace(observation, analysis=analysis))
        return analysis


class GetSystemStatusUseCase:
    def __init__(
        self, repository: ObservationRepositoryPort, browser: BrowserObservationPort
    ) -> None:
        self.repository, self.browser = repository, browser

    async def execute(self) -> dict[str, str | bool]:
        database = await self.repository.available()
        browser = await self.browser.available()
        return {
            "backend": True,
            "database": database,
            "browser": browser,
            "ready": database and browser,
            "version": "0.1.0",
        }
