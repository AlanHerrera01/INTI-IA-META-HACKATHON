from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from inti.domain.entities import Observation
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.infrastructure.persistence import Base, SQLAlchemyObservationRepository
from inti.infrastructure.storage import LocalArtifactStorage
from inti.main import create_app
from inti.presentation.dependencies import Services


@pytest.fixture
def observation() -> Observation:
    return Observation(
        source_url="http://127.0.0.1:8001/", page_title="Inventory", width=1440, height=900
    )


@pytest.fixture
def repository(tmp_path: Path) -> SQLAlchemyObservationRepository:
    repository = SQLAlchemyObservationRepository(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(repository.engine)
    yield repository
    repository.engine.dispose()


@pytest.fixture
def services(
    tmp_path: Path, repository: SQLAlchemyObservationRepository, observation: Observation
) -> Services:
    settings = ConfigurationProvider(
        _env_file=None, artifact_dir=tmp_path / "artifacts", meta_api_key=""
    )
    storage = LocalArtifactStorage(settings.artifact_dir)
    browser = AsyncMock()
    browser.capture.return_value = observation
    browser.available.return_value = True
    return Services(settings, repository, storage, browser, MetaModelAPIAdapter(settings, storage))


@pytest.fixture
def client(services: Services) -> TestClient:
    with TestClient(create_app(services)) as client:
        yield client
