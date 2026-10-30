"""Read only committed, allowlisted evaluation reports. Never infer missing metrics."""

import asyncio
import hashlib
import json
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from inti.domain.exceptions import DependencyError, NotFoundError
from inti.presentation.api import Container

router = APIRouter(prefix="/api/v1/benchmarks", tags=["Benchmark evidence"])


class BenchmarkArtifact(BaseModel):
    report_id: str
    filename: str
    sha256: str
    evaluation_mode: str
    data: dict[str, Any]
    limitations: list[str]


class BenchmarkPage(BaseModel):
    items: list[BenchmarkArtifact]
    unavailable: list[str]
    comparative_evaluation_available: bool = False


FILES = {"verification": "phase-05-verification.json", "planning-policy": "phase-02-policy.json"}


async def read_report(id: str, services: Container) -> BenchmarkArtifact:
    if id not in FILES:
        raise NotFoundError("Benchmark report not found")
    root = services.settings.benchmark_report_dir.resolve()
    path = root / FILES[id]
    if not path.is_file():
        raise NotFoundError("No measured report is available")
    if path.is_symlink() or path.resolve().parent != root or path.stat().st_size > 2_000_000:
        raise DependencyError("Benchmark report source is invalid")
    try:
        raw = await asyncio.to_thread(path.read_bytes)
        data = json.loads(raw)
        if not isinstance(data, dict) or not isinstance(data.get("mode"), str):
            raise ValueError()
        # Both sources explicitly declare no live-model evaluation.
        for value in data.values():
            if isinstance(value, dict) and set(value) == {"numerator", "denominator"}:
                numerator, denominator = value["numerator"], value["denominator"]
                if (
                    isinstance(numerator, bool)
                    or not isinstance(numerator, int)
                    or isinstance(denominator, bool)
                    or not isinstance(denominator, int)
                    or not 0 <= numerator <= denominator
                ):
                    raise ValueError()
        return BenchmarkArtifact(
            report_id=id,
            filename=path.name,
            sha256=hashlib.sha256(raw).hexdigest(),
            evaluation_mode=data["mode"],
            data=data,
            limitations=[
                "No Phase 6 comparative evaluation exists in this repository.",
                "Local trials and policy fixtures do not establish live model performance.",
                "Missing execution latency, unsafe-action and recovery rates remain unavailable.",
            ],
        )
    except (ValueError, OSError):
        raise DependencyError("Benchmark report could not be validated") from None


@router.get("")
async def reports(services: Container) -> BenchmarkPage:
    items, unavailable = [], []
    for id in FILES:
        try:
            items.append(await read_report(id, services))
        except NotFoundError:
            unavailable.append(id)
    return BenchmarkPage(items=items, unavailable=unavailable)


@router.get("/{id}")
async def report(id: str, services: Container) -> BenchmarkArtifact:
    return await read_report(id, services)
