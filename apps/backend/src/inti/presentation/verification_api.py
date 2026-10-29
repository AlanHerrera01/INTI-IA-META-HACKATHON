import html
import json
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from inti.application.verification import IndependentVerificationOrchestrator
from inti.domain.exceptions import ConfigurationError
from inti.domain.verification import (
    CriteriaVersion,
    CriterionResult,
    Evidence,
    SuccessCriterion,
    VerificationBundle,
    VerificationEvent,
    VerificationSession,
    VerificationVerdict,
)
from inti.presentation.api import Container
from inti.presentation.execution_auth import require_operator

router = APIRouter(prefix="/api/v1/verifications", tags=["Independent verification"])


def operator(request: Request, services: Container) -> str:
    return require_operator(
        services.settings,
        request.headers.get("Authorization"),
        services.settings.verification_enabled,
    )


def verifier(
    services: Container, actor: Annotated[str, Depends(operator)]
) -> IndependentVerificationOrchestrator:
    if services.verification is None:
        raise ConfigurationError("Independent verification is not configured")
    return services.verification


Verifier = Annotated[IndependentVerificationOrchestrator, Depends(verifier)]
Operator = Annotated[str, Depends(operator)]


class CreateVerificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    execution_id: UUID
    criteria_version_id: UUID | None = None
    idempotency_key: str = Field(default="terminal", min_length=1, max_length=80)


class CriteriaRevisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    execution_id: UUID
    expected_version: int = Field(ge=1)
    additional: list[SuccessCriterion] = Field(min_length=1, max_length=20)
    reason: str = Field(min_length=1, max_length=500)


class VerificationPage(BaseModel):
    items: list[VerificationBundle]
    total: int
    offset: int
    limit: int


class ExecutionSummary(BaseModel):
    status: str
    declared_overall_goal_verified: bool
    action_count: int
    actions_executed: int
    immediate_postconditions_passed: int


class IntegrityCheck(BaseModel):
    evidence_id: UUID
    intact: bool
    error: str | None


class VerificationReport(BaseModel):
    project: Literal["INTI AI"]
    task_id: UUID
    execution_id: UUID
    verification_id: UUID
    original_objective: str
    criteria_version: CriteriaVersion
    verification: VerificationSession
    execution_summary: ExecutionSummary
    evidence: list[Evidence]
    criteria_results: list[CriterionResult]
    final_verdict: VerificationVerdict | None
    effective_verdict: VerificationVerdict | None
    integrity_checks: list[IntegrityCheck]
    limitations: list[str]


@router.post("", status_code=201)
async def create(payload: CreateVerificationRequest, service: Verifier) -> VerificationBundle:
    return await service.create(
        payload.execution_id, payload.criteria_version_id, payload.idempotency_key
    )


@router.post("/criteria")
async def revise(
    payload: CriteriaRevisionRequest, service: Verifier, actor: Operator
) -> CriteriaVersion:
    return await service.revise(
        payload.execution_id,
        payload.expected_version,
        tuple(payload.additional),
        actor,
        payload.reason,
    )


@router.get("")
async def history(
    service: Verifier,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    execution_id: UUID | None = None,
) -> VerificationPage:
    items, total = await service.repository.list_verifications(offset, limit, execution_id)
    return VerificationPage(items=items, total=total, offset=offset, limit=limit)


@router.get("/{id}")
async def get(id: UUID, service: Verifier) -> VerificationBundle:
    return await service.get(id)


@router.get("/{id}/criteria")
async def criteria(id: UUID, service: Verifier) -> CriteriaVersion:
    return (await service.get(id)).criteria_version


@router.get("/{id}/evidence")
async def evidence(id: UUID, service: Verifier) -> tuple[Evidence, ...]:
    return (await service.get(id)).evidence


@router.get("/{id}/evidence/{evidence_id}/artifact")
async def artifact(id: UUID, evidence_id: UUID, service: Verifier) -> Response:
    item, content = await service.artifact(id, evidence_id)
    return Response(
        content,
        media_type=item.metadata.content_type,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/{id}/report", response_model=VerificationReport)
async def report(
    id: UUID, service: Verifier, format: Literal["json", "html"] = "json"
) -> VerificationReport | Response:
    value = VerificationReport.model_validate(await service.report(id))
    if format == "html":
        body = (
            "<!doctype html><html lang='en'><meta charset='utf-8'>"
            "<title>INTI AI verification report</title><style>"
            "body{font:15px system-ui;max-width:1100px;margin:40px auto;"
            "background:#0b1220;color:#f8fafc}"
            "pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>"
            "<h1>INTI AI · Independent verification</h1><pre>"
            + html.escape(json.dumps(value.model_dump(mode="json"), indent=2))
            + "</pre></html>"
        )
        return Response(
            body,
            media_type="text/html",
            headers={
                "Cache-Control": "private, no-store",
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
                "X-Content-Type-Options": "nosniff",
            },
        )
    return value


@router.get("/{id}/events")
async def events(
    id: UUID, service: Verifier, after: Annotated[int, Query(ge=0)] = 0
) -> list[VerificationEvent]:
    await service.get(id)
    return await service.repository.events(id, after)


@router.post("/{id}/cancel")
async def cancel(id: UUID, service: Verifier) -> VerificationBundle:
    return await service.cancel(id)
