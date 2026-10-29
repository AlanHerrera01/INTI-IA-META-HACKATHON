from dataclasses import dataclass

from inti.domain.ports import (
    ArtifactStoragePort,
    BrowserObservationPort,
    ObservationRepositoryPort,
    VisionModelPort,
)
from inti.infrastructure.browser import PlaywrightBrowserAdapter
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.infrastructure.persistence import SQLAlchemyObservationRepository
from inti.infrastructure.storage import LocalArtifactStorage


@dataclass
class Services:
    settings: ConfigurationProvider
    repository: ObservationRepositoryPort
    storage: ArtifactStoragePort
    browser: BrowserObservationPort
    model: VisionModelPort


def build_services(settings: ConfigurationProvider) -> Services:
    storage = LocalArtifactStorage(settings.artifact_dir, settings.max_artifact_bytes)
    return Services(
        settings,
        SQLAlchemyObservationRepository(settings.database_url.get_secret_value()),
        storage,
        PlaywrightBrowserAdapter(settings, storage),
        MetaModelAPIAdapter(settings, storage),
    )
