import asyncio
from pathlib import Path
from uuid import UUID

from inti.domain.exceptions import DependencyError, NotFoundError


class LocalArtifactStorage:
    def __init__(self, root: Path, max_bytes: int = 5_000_000) -> None:
        self.root, self.max_bytes = root.resolve(), max_bytes
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, id: UUID) -> Path:
        path = self.root / f"{UUID(str(id))}.png"
        if path.is_symlink():
            raise DependencyError("Invalid artifact")
        return path

    async def write(self, id: UUID, data: bytes) -> None:
        if len(data) > self.max_bytes or not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise DependencyError("Screenshot is invalid or exceeds artifact size limit")
        path = self.path(id)
        temporary = path.with_suffix(".tmp")
        await asyncio.to_thread(temporary.write_bytes, data)
        await asyncio.to_thread(temporary.replace, path)

    async def read(self, id: UUID) -> bytes:
        try:
            return await asyncio.to_thread(self.path(id).read_bytes)
        except FileNotFoundError as exc:
            raise NotFoundError("Screenshot not found") from exc

    async def delete(self, id: UUID) -> None:
        await asyncio.to_thread(self.path(id).unlink, missing_ok=True)
