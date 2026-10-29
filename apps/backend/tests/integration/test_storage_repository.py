from uuid import uuid4

import pytest

from inti.domain.exceptions import DependencyError, NotFoundError
from inti.infrastructure.storage import LocalArtifactStorage


async def test_artifact_roundtrip(tmp_path) -> None:
    storage = LocalArtifactStorage(tmp_path, 100)
    id = uuid4()
    data = b"\x89PNG\r\n\x1a\n" + b"synthetic-test-bytes"
    await storage.write(id, data)
    assert await storage.read(id) == data
    await storage.delete(id)
    with pytest.raises(NotFoundError):
        await storage.read(id)
    with pytest.raises(DependencyError):
        await storage.write(id, b"not png")
    with pytest.raises(DependencyError):
        await storage.write(id, data * 20)
    with pytest.raises(ValueError):
        storage.path("../../secret")


async def test_repository_roundtrip(repository, observation) -> None:
    await repository.save(observation)
    assert await repository.get(observation.id) == observation
    assert await repository.latest(20) == [observation]
    assert await repository.get(uuid4()) is None
    assert await repository.available()
