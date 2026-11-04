"""Operator-reviewed local-computer tasks and outbound paired-agent protocol."""

import hashlib
from pathlib import Path, PureWindowsPath
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, ConfigDict, Field

from inti.domain.computer import (
    ApplicationLaunchPlan,
    ComputerApplication,
    ComputerPlan,
    parse_computer_plan,
)
from inti.domain.documents import DOCUMENT_OUTPUTS, DocumentPlan, DocumentRequest
from inti.domain.exceptions import ConfigurationError
from inti.domain.execution import ExecutionError, OperatorRequired
from inti.infrastructure.computer_store import ComputerStore
from inti.presentation.execution_auth import require_operator

router = APIRouter(prefix="/api/v1/computer", tags=["Local computer"])


def store(request: Request) -> ComputerStore:
    settings = request.app.state.services.settings
    if settings.inti_runtime_mode != "local_computer":
        raise ConfigurationError("Local-computer mode is not enabled")
    return ComputerStore(Path(settings.artifact_dir) / "computer" / "ledger.sqlite")


Store = Annotated[ComputerStore, Depends(store)]


def operator(request: Request) -> str:
    return require_operator(
        request.app.state.services.settings, request.headers.get("Authorization"), True
    )


Operator = Annotated[str, Depends(operator)]


def device(device_id: UUID, db: Store, authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise OperatorRequired("Paired device capability required")
    try:
        db.authenticate(str(device_id), (authorization or "").removeprefix("Bearer "))
    except ValueError:
        raise OperatorRequired("Paired device authentication failed") from None
    return str(device_id)


Device = Annotated[str, Depends(device)]


class Enrollment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=32, max_length=128)
    name: str = Field(min_length=1, max_length=80)
    platform: str = Field(max_length=20)
    root: str = Field(min_length=1, max_length=1024)


class Prepare(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_id: UUID
    filename: str = "INTI-notes.txt"
    content: str = Field(min_length=1, max_length=16000)
    url: str = Field(max_length=2048)


class Approval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")


class StepReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Literal[
        "write_file",
        "open_notepad",
        "open_browser",
        "open_application",
        "validate_document_data",
        "write_quote_docx",
        "write_budget_xlsx",
        "write_quote_pdf",
        "write_document_summary",
        "verify_document_package",
    ]
    status: Literal["VERIFIED_READBACK", "LAUNCH_REQUESTED", "VALIDATED"]
    path: str | None = Field(default=None, max_length=1500)
    sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    bytes: int | None = Field(default=None, ge=0, le=2_000_000)
    pid: int | None = Field(default=None, gt=0)
    url: str | None = Field(default=None, max_length=2048)
    application_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    identity: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class Receipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    claim: str = Field(min_length=20, max_length=128)
    ok: bool
    cancelled: bool = False
    steps: list[StepReceipt] = Field(max_length=6)
    error: str | None = Field(default=None, max_length=500)


class Progress(BaseModel):
    model_config = ConfigDict(extra="forbid")
    claim: str = Field(min_length=20, max_length=128)
    steps: list[StepReceipt] = Field(min_length=1, max_length=6)


@router.post("/devices/{device_id}/tasks/{id}/progress")
def progress(
    device_id: UUID, id: UUID, payload: Progress, authenticated: Device, db: Store
) -> dict[str, bool]:
    try:
        task = db.get(str(id))
        if task["device_id"] != authenticated:
            raise ValueError("Task belongs to another paired device")
        expected = [step["id"] for step in task["steps"]]
        if [step.id for step in payload.steps] != expected[: len(payload.steps)]:
            raise ExecutionError(
                "INVALID_STEP_RECEIPT", "Step order does not match the reviewed plan"
            )
        db.progress(
            authenticated,
            str(id),
            payload.claim,
            [step.model_dump(exclude_none=True) for step in payload.steps],
        )
    except ValueError as error:
        raise conflict(error) from None
    return {"recorded": True}


def conflict(error: ValueError) -> ExecutionError:
    return ExecutionError("COMPUTER_REQUEST_REJECTED", str(error))


@router.post("/pairing")
def pairing(db: Store, actor: Operator) -> dict[str, Any]:
    return db.pairing()


@router.post("/enroll")
def enroll(payload: Enrollment, db: Store) -> dict[str, Any]:
    try:
        return db.enroll(payload.code, payload.name, payload.platform, payload.root)
    except ValueError as error:
        raise conflict(error) from None


@router.get("/state")
def state(db: Store, actor: Operator) -> dict[str, Any]:
    return {
        "devices": db.devices(),
        "tasks": db.tasks(),
        "model_calls": 0,
        "planning_mode": "authored_local_sample",
    }


@router.post("/tasks")
def prepare(payload: Prepare, db: Store, actor: Operator) -> dict[str, Any]:
    target = next((item for item in db.devices() if item["id"] == str(payload.device_id)), None)
    if not target:
        raise ExecutionError("DEVICE_NOT_FOUND", "Pair a Windows agent first")
    try:
        plan = ComputerPlan(id=uuid4(), authorized_root=target["root"], **payload.model_dump())
        return db.create(plan)
    except ValueError as error:
        raise conflict(error) from None


@router.post("/tasks/{id}/approve")
def approve(id: UUID, payload: Approval, db: Store, actor: Operator) -> dict[str, Any]:
    try:
        return db.approve(str(id), payload.digest)
    except ValueError as error:
        raise conflict(error) from None


class PrepareDocuments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_id: UUID
    document_request: DocumentRequest


@router.post("/document-tasks")
def prepare_documents(payload: PrepareDocuments, db: Store, actor: Operator) -> dict[str, Any]:
    target = next((item for item in db.devices() if item["id"] == str(payload.device_id)), None)
    if not target:
        raise ExecutionError("DEVICE_NOT_FOUND", "Pair a Windows agent first")
    try:
        plan = DocumentPlan(
            id=uuid4(),
            device_id=payload.device_id,
            authorized_root=target["root"],
            filename="resumen.txt",
            content=payload.document_request.summary(),
            document_request=payload.document_request,
        )
        return db.create(plan)
    except ValueError as error:
        raise conflict(error) from None


@router.post("/tasks/{id}/cancel")
def cancel(id: UUID, db: Store, actor: Operator) -> dict[str, Any]:
    try:
        return db.cancel(str(id))
    except ValueError as error:
        raise conflict(error) from None


@router.post("/devices/{id}/revoke")
def revoke(id: UUID, db: Store, actor: Operator) -> dict[str, bool]:
    db.revoke(str(id))
    return {"revoked": True}


@router.post("/devices/{device_id}/claim")
def claim(device_id: UUID, authenticated: Device, db: Store) -> dict[str, Any]:
    try:
        return {"task": db.claim(authenticated)}
    except ValueError as error:
        raise conflict(error) from None


@router.get("/devices/{device_id}/tasks/{id}")
def agent_state(device_id: UUID, id: UUID, authenticated: Device, db: Store) -> dict[str, Any]:
    try:
        return db.agent_state(authenticated, str(id))
    except ValueError as error:
        raise conflict(error) from None


@router.post("/devices/{device_id}/tasks/{id}/receipt")
def receipt(
    device_id: UUID, id: UUID, payload: Receipt, authenticated: Device, db: Store
) -> dict[str, Any]:
    try:
        task = db.get(str(id))
        if task["device_id"] != authenticated:
            raise ValueError("Task belongs to another paired device")
        if payload.ok:
            plan = parse_computer_plan(task["plan"])
            if isinstance(plan, DocumentPlan):
                steps = payload.steps
                if (
                    payload.cancelled
                    or len(steps) != 6
                    or steps[0].id != "validate_document_data"
                    or steps[0].status != "VALIDATED"
                    or steps[0].sha256 != plan.digest()
                ):
                    raise ValueError("Document validation receipt differs from the approved plan")
                for actual, (step, name) in zip(steps[1:], DOCUMENT_OUTPUTS, strict=True):
                    expected = PureWindowsPath(plan.authorized_root) / str(plan.id) / name
                    if (
                        actual.id != step
                        or actual.status != "VERIFIED_READBACK"
                        or PureWindowsPath(actual.path or "") != expected
                        or not actual.sha256
                        or not actual.bytes
                    ):
                        raise ValueError("Document receipt differs from the approved output")
                return db.receipt(
                    authenticated,
                    str(id),
                    payload.claim,
                    payload.model_dump(exclude={"claim"}, exclude_none=True),
                )
            if isinstance(plan, ApplicationLaunchPlan):
                if (
                    payload.cancelled
                    or len(payload.steps) != 1
                    or payload.steps[0].id != "open_application"
                    or payload.steps[0].status != "LAUNCH_REQUESTED"
                    or payload.steps[0].application_id != plan.application.id
                    or payload.steps[0].identity != plan.application.identity
                    or payload.steps[0].path != plan.application.path
                    or payload.steps[0].pid is None
                ):
                    raise ValueError("Application receipt does not match the approved plan")
                return db.receipt(
                    authenticated,
                    str(id),
                    payload.claim,
                    payload.model_dump(exclude={"claim"}, exclude_none=True),
                )
            content = plan.content.encode("utf-8")
            path = PureWindowsPath(plan.authorized_root) / str(plan.id) / plan.filename
            steps = payload.steps
            if (
                payload.cancelled
                or len(steps) != 3
                or [step.id for step in steps] != ["write_file", "open_notepad", "open_browser"]
                or steps[0].status != "VERIFIED_READBACK"
                or steps[0].sha256 != hashlib.sha256(content).hexdigest()
                or steps[0].bytes != len(content)
                or PureWindowsPath(steps[0].path or "") != path
                or PureWindowsPath(steps[1].path or "") != path
                or steps[1].status != "LAUNCH_REQUESTED"
                or steps[2].status != "LAUNCH_REQUESTED"
                or steps[2].url != plan.url
            ):
                raise ValueError("Agent success receipt does not match the approved actions")
        return db.receipt(
            authenticated,
            str(id),
            payload.claim,
            payload.model_dump(exclude={"claim"}, exclude_none=True),
        )
    except ValueError as error:
        raise conflict(error) from None


class ApplicationCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")
    applications: list[ComputerApplication] = Field(max_length=300)


class ApplicationPermission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identity: str = Field(pattern=r"^[a-f0-9]{64}$")
    allowed: bool


class PrepareApplication(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_id: UUID
    application_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    identity: str = Field(pattern=r"^[a-f0-9]{64}$")


@router.post("/devices/{device_id}/applications")
def publish_applications(
    device_id: UUID, payload: ApplicationCatalog, authenticated: Device, db: Store
) -> dict:
    try:
        db.publish_applications(authenticated, payload.applications)
        return {"recorded": True}
    except ValueError as error:
        raise conflict(error) from None


@router.get("/applications/{device_id}")
def list_applications(device_id: UUID, db: Store, actor: Operator) -> dict:
    return db.applications(str(device_id))


@router.post("/applications/{device_id}/{app_id}/permission")
def permit_application(
    device_id: UUID, app_id: str, payload: ApplicationPermission, db: Store, actor: Operator
) -> dict:
    try:
        db.permit_application(str(device_id), app_id, payload.identity, payload.allowed)
        return {"recorded": True}
    except ValueError as error:
        raise conflict(error) from None


@router.post("/application-tasks")
def prepare_application(payload: PrepareApplication, db: Store, actor: Operator) -> dict:
    try:
        target = next(item for item in db.devices() if item["id"] == str(payload.device_id))
        app = next(
            item
            for item in db.applications(str(payload.device_id))["applications"]
            if item["id"] == payload.application_id and item["identity"] == payload.identity
        )
        application = ComputerApplication.model_validate(
            {key: value for key, value in app.items() if key != "allowed"}
        )
        return db.create(
            ApplicationLaunchPlan(
                id=uuid4(),
                device_id=payload.device_id,
                authorized_root=target["root"],
                application=application,
            )
        )
    except StopIteration:
        raise conflict(ValueError("Application or paired device is unavailable")) from None
    except ValueError as error:
        raise conflict(error) from None
