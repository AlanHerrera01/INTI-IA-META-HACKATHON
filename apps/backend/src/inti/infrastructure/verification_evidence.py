import asyncio
import json
import os
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from pydantic import TypeAdapter, ValidationError

from inti.domain.exceptions import DependencyError, NotFoundError
from inti.domain.execution import ExecutionBundle, ExecutionError
from inti.domain.verification import (
    Evidence,
    EvidenceMetadata,
    EvidenceType,
    ValidatedEvidence,
    VerificationBundle,
    canonical_bytes,
    content_hash,
)
from inti.domain.verification_ports import (
    CollectedEvidence,
    EvidenceCollection,
    ReadOnlyApplicationStatePort,
    ReadOnlyBrowserEvidencePort,
    ReadOnlySnapshot,
    StateReadRequest,
)
from inti.infrastructure.config import ConfigurationProvider

SNAPSHOT = TypeAdapter(ReadOnlySnapshot)


class LocalEvidenceStorage:
    def __init__(self, root: Path, max_bytes: int = 5_000_000) -> None:
        self.root, self.max_bytes = root.resolve(), max_bytes
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, id: UUID) -> Path:
        path = self.root / (str(UUID(str(id))) + ".bin")
        if path.is_symlink() or path.resolve().parent != self.root:
            raise DependencyError("Invalid evidence artifact reference")
        return path

    async def write(self, id: UUID, content: bytes) -> None:
        if not 0 < len(content) <= self.max_bytes:
            raise DependencyError("Evidence artifact is empty or exceeds its size limit")

        def create() -> None:
            try:
                with self._path(id).open("xb") as artifact:
                    artifact.write(content)
                    artifact.flush()
                    os.fsync(artifact.fileno())
            except FileExistsError as exc:
                raise ExecutionError(
                    "EVIDENCE_IMMUTABLE", "An evidence artifact cannot be overwritten"
                ) from exc

        await asyncio.to_thread(create)

    async def read(self, id: UUID) -> bytes:
        def read() -> bytes:
            try:
                with self._path(id).open("rb") as artifact:
                    content = artifact.read(self.max_bytes + 1)
                if len(content) > self.max_bytes:
                    raise DependencyError("Evidence artifact exceeds its size limit")
                return content
            except FileNotFoundError as exc:
                raise NotFoundError("Evidence artifact not found") from exc

        return await asyncio.to_thread(read)

    async def delete(self, id: UUID) -> None:
        await asyncio.to_thread(self._path(id).unlink, missing_ok=True)


class ReadOnlyInventoryAdapter:
    def __init__(
        self, settings: ConfigurationProvider, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self.settings, self.transport = settings, transport

    async def read_snapshot(self, request: StateReadRequest) -> ReadOnlySnapshot:
        config = self.settings
        token = config.verification_read_token.get_secret_value()
        if not token:
            raise DependencyError("Read-only application capability is not configured")
        headers = {
            "Authorization": "Bearer " + token,
            "Cache-Control": "no-cache",
            "X-Collection-ID": str(request.collection_id),
            "X-Execution-ID": str(request.execution_id),
            "X-Task-ID": str(request.task_id),
            "X-Evidence-Nonce": str(request.nonce),
            "X-Record-ID": request.record_id,
        }
        for attempt in range(config.verification_source_retries + 1):
            try:
                async with httpx.AsyncClient(
                    timeout=config.verification_source_timeout_seconds,
                    follow_redirects=False,
                    transport=self.transport,
                    trust_env=False,
                ) as client:
                    async with client.stream(
                        "GET",
                        config.verification_readonly_url + "verification/v1/snapshot",
                        headers=headers,
                    ) as response:
                        body = bytearray()
                        async for chunk in response.aiter_bytes(chunk_size=65536):
                            body.extend(chunk)
                            if len(body) > config.verification_max_response_bytes:
                                raise ValueError("Read-only evidence response exceeds limit")
                        response.raise_for_status()
                snapshot = SNAPSHOT.validate_json(bytes(body), strict=True)
                if snapshot.request != request:
                    raise ValueError("Read-only response does not bind to this fresh request")
                return snapshot
            except (httpx.HTTPError, ValueError, ValidationError):
                if attempt == config.verification_source_retries:
                    break
                await asyncio.sleep(0.2 * (attempt + 1))
        raise DependencyError("Fresh read-only application state is unavailable or invalid")


class InventoryEvidenceCollector:
    def __init__(
        self,
        state: ReadOnlyApplicationStatePort,
        browser: ReadOnlyBrowserEvidencePort,
        settings: ConfigurationProvider,
    ) -> None:
        self.state, self.browser, self.settings = state, browser, settings

    async def collect(
        self, bundle: VerificationBundle, execution: ExecutionBundle
    ) -> EvidenceCollection:
        session = bundle.session
        record = bundle.criteria_version.criteria[0].target_reference.record_id
        items: list[CollectedEvidence] = []
        failures: list[str] = []
        store_id: str | None = None

        def metadata(
            nonce: UUID,
            source: str,
            method: str,
            url: str,
            kind: str,
            content: bytes,
            role: str = "final",
        ) -> EvidenceMetadata:
            return EvidenceMetadata(
                source,
                method,
                record,
                session.task_id,
                session.execution_id,
                session.id,
                role,
                url,
                nonce,
                store_id,
                kind,
                len(content),
            )

        for sample in range(2):
            nonce = uuid4()
            request = StateReadRequest(
                session.id, session.execution_id, session.task_id, record, nonce
            )
            try:
                snapshot = await self.state.read_snapshot(request)
                store_id = str(snapshot.store_id)
                content = canonical_bytes(asdict(snapshot))
                meta = metadata(
                    nonce,
                    snapshot.source_system,
                    "GET:SQLite mode=ro,query_only",
                    self.settings.verification_readonly_url + "verification/v1/snapshot",
                    "application/json",
                    content,
                )
                for kind in (EvidenceType.READ_ONLY_API_RESPONSE, EvidenceType.DATABASE_STATE):
                    items.append(
                        CollectedEvidence(
                            kind, "inventory-readonly-api", snapshot.captured_at, content, meta
                        )
                    )
            except DependencyError:
                failures.append(f"READ_ONLY_STATE_SAMPLE_{sample + 1}_UNAVAILABLE")
            if sample == 0:
                browser_nonce = uuid4()
                request = StateReadRequest(
                    session.id, session.execution_id, session.task_id, record, browser_nonce
                )
                try:
                    capture = await self.browser.capture_readonly(request)
                    stamp = capture.observation.timestamp
                    meta = metadata(
                        browser_nonce,
                        "inti.inventory.readonly.browser.v1",
                        "Fresh isolated GET-only Chromium context",
                        self.settings.verification_readonly_url,
                        "image/png",
                        capture.png,
                    )
                    items.append(
                        CollectedEvidence(
                            EvidenceType.SCREENSHOT,
                            "inventory-readonly-browser",
                            stamp,
                            capture.png,
                            meta,
                        )
                    )
                    content = canonical_bytes(capture.dom)
                    meta = metadata(
                        browser_nonce,
                        "inti.inventory.readonly.browser.v1",
                        "Fixed read-only DOM fields",
                        self.settings.verification_readonly_url,
                        "application/json",
                        content,
                    )
                    items.append(
                        CollectedEvidence(
                            EvidenceType.DOM_SNAPSHOT,
                            "inventory-readonly-browser",
                            stamp,
                            content,
                            meta,
                        )
                    )
                except (DependencyError, ExecutionError):
                    failures.append("READ_ONLY_BROWSER_UNAVAILABLE")
        trace = canonical_bytes(
            {
                "execution_id": str(execution.session.id),
                "status": execution.session.status,
                "declared_overall_goal_verified": execution.session.overall_goal_verified,
                "actions": [
                    {
                        "id": str(r.action_id),
                        "status": r.status,
                        "executed": r.action_executed,
                        "immediate_postconditions": r.postconditions_satisfied,
                        "uncertain": r.may_have_executed,
                    }
                    for r in execution.results
                ],
            }
        )
        items.append(
            CollectedEvidence(
                EvidenceType.EXECUTION_TRACE,
                "execution-declaration",
                datetime.now(UTC),
                trace,
                metadata(
                    uuid4(),
                    "inti.execution.declared.v1",
                    "Stored execution trace; not outcome proof",
                    "execution:" + str(execution.session.id),
                    "application/json",
                    trace,
                    "supplementary",
                ),
            )
        )
        return EvidenceCollection(tuple(items), tuple(failures))


class EvidenceIntegrityAdapter:
    def __init__(self, settings: ConfigurationProvider) -> None:
        self.settings = settings

    def validate(
        self,
        evidence: Evidence,
        content: bytes,
        bundle: VerificationBundle,
        execution: ExecutionBundle,
        allow_archived: bool = False,
    ) -> ValidatedEvidence:
        def invalid(code: str) -> ValidatedEvidence:
            return ValidatedEvidence(evidence, {}, False, code)

        meta = evidence.metadata
        if content_hash(content) != evidence.content_hash or len(content) != meta.byte_count:
            return invalid("EVIDENCE_HASH_OR_SIZE_MISMATCH")
        if (
            meta.verification_id != bundle.session.id
            or meta.task_id != bundle.session.task_id
            or meta.execution_id != execution.session.id
        ):
            return invalid("EVIDENCE_CORRELATION_MISMATCH")
        if meta.target_record_id != bundle.criteria_version.criteria[0].target_reference.record_id:
            return invalid("EVIDENCE_TARGET_MISMATCH")
        now = datetime.now(UTC)
        if (evidence.captured_at - now).total_seconds() > 2:
            return invalid("EVIDENCE_TIMESTAMP_IN_FUTURE")
        if meta.role == "final":
            if (
                not execution.session.completed_at
                or evidence.captured_at < execution.session.completed_at
                or evidence.captured_at < bundle.session.started_at
            ):
                return invalid("EVIDENCE_PRECEDES_EXECUTION_OR_VERIFICATION")
            if (
                not allow_archived
                and (now - evidence.captured_at).total_seconds()
                > self.settings.verification_evidence_max_age_seconds
            ):
                return invalid("EVIDENCE_STALE")
        elif meta.role == "baseline":
            baseline = bundle.criteria_version.baseline
            if (
                not baseline
                or baseline.artifact_id != evidence.artifact_reference
                or baseline.content_hash != evidence.content_hash
                or baseline.captured_at != evidence.captured_at
            ):
                return invalid("BASELINE_NOT_BOUND_TO_APPROVED_CRITERIA")
            if (
                not execution.session.started_at
                or evidence.captured_at >= execution.session.started_at
            ):
                return invalid("BASELINE_IS_NOT_PRE_EXECUTION")
        if evidence.evidence_type == EvidenceType.SCREENSHOT:
            if (
                evidence.source != "inventory-readonly-browser"
                or meta.source_url != self.settings.verification_readonly_url
                or not content.startswith(b"\x89PNG\r\n\x1a\n")
            ):
                return invalid("INVALID_READ_ONLY_SCREENSHOT")
            return ValidatedEvidence(evidence, {}, True)
        try:
            parsed = json.loads(content)
            if canonical_bytes(parsed) != content or not isinstance(parsed, dict):
                return invalid("EVIDENCE_IS_NOT_CANONICAL_JSON")
            if evidence.evidence_type in {
                EvidenceType.READ_ONLY_API_RESPONSE,
                EvidenceType.DATABASE_STATE,
            }:
                if (
                    evidence.source != "inventory-readonly-api"
                    or meta.source_url
                    != self.settings.verification_readonly_url + "verification/v1/snapshot"
                ):
                    return invalid("UNTRUSTED_DATABASE_EVIDENCE_SOURCE")
                snapshot = SNAPSHOT.validate_json(content, strict=True)
                request = snapshot.request
                collection_id = (
                    bundle.criteria_version.baseline.collection_id
                    if meta.role == "baseline" and bundle.criteria_version.baseline
                    else bundle.session.id
                )
                if (
                    request.collection_id != collection_id
                    or request.nonce != meta.nonce
                    or request.record_id != meta.target_record_id
                    or request.task_id != meta.task_id
                    or request.execution_id != meta.execution_id
                ):
                    return invalid("EVIDENCE_REQUEST_BINDING_MISMATCH")
                if (
                    str(snapshot.store_id) != meta.source_store_id
                    or snapshot.captured_at != evidence.captured_at
                ):
                    return invalid("EVIDENCE_SOURCE_ID_OR_TIME_MISMATCH")
            elif evidence.evidence_type == EvidenceType.DOM_SNAPSHOT:
                if (
                    evidence.source != "inventory-readonly-browser"
                    or meta.source_url != self.settings.verification_readonly_url
                    or parsed.get("record_id") != meta.target_record_id
                    or parsed.get("nonce") != str(meta.nonce)
                    or type(parsed.get("visible")) is not bool
                    or parsed.get("url") != self.settings.verification_readonly_url
                ):
                    return invalid("INVALID_READ_ONLY_DOM_PROVENANCE")
            elif evidence.evidence_type == EvidenceType.EXECUTION_TRACE:
                if evidence.source != "execution-declaration" or meta.role != "supplementary":
                    return invalid("EXECUTION_TRACE_IS_NOT_INDEPENDENT_STATE")
            else:
                return invalid("UNSUPPORTED_EVIDENCE_PROVENANCE")
            return ValidatedEvidence(evidence, parsed, True)
        except (ValueError, ValidationError):
            return invalid("INVALID_EVIDENCE_SCHEMA")
