"""Independent verification contracts; no action execution authority."""

import hashlib
import json
import math
import re
from dataclasses import asdict, dataclass, field, replace
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from inti.domain.execution import ExecutionError
from inti.domain.planning import aware, nonempty

type Scalar = str | int | float | bool | None
type ExpectedValue = Scalar | dict[str, Scalar]


def canonical_bytes(value: Any) -> bytes:
    def normalize(item: Any) -> Any:
        if isinstance(item, float):
            if not math.isfinite(item):
                raise ValueError("Evidence numbers must be finite")
            return int(item) if item.is_integer() else item
        if isinstance(item, dict):
            return {key: normalize(child) for key, child in item.items()}
        if isinstance(item, (tuple, list)):
            return [normalize(child) for child in item]
        return item

    return json.dumps(
        normalize(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
        default=str,
    ).encode("utf-8")


def content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class VerificationStatus(StrEnum):
    CREATED = "CREATED"
    COLLECTING_EVIDENCE = "COLLECTING_EVIDENCE"
    EVALUATING = "EVALUATING"
    COMPLETED = "COMPLETED"
    INCONCLUSIVE = "INCONCLUSIVE"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class VerificationVerdict(StrEnum):
    VERIFIED_SUCCESS = "VERIFIED_SUCCESS"
    VERIFIED_FAILURE = "VERIFIED_FAILURE"
    INCONCLUSIVE = "INCONCLUSIVE"


class AssertionType(StrEnum):
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    EXISTS = "exists"
    NOT_EXISTS = "not_exists"
    CONTAINS = "contains"
    STATE_TRANSITION = "state_transition"
    RECORD_PERSISTED = "record_persisted"
    URL_MATCHES = "url_matches"
    ELEMENT_VISIBLE = "element_visible"


class EvidenceType(StrEnum):
    SCREENSHOT = "SCREENSHOT"
    READ_ONLY_API_RESPONSE = "READ_ONLY_API_RESPONSE"
    DATABASE_STATE = "DATABASE_STATE"
    DOM_SNAPSHOT = "DOM_SNAPSHOT"
    APPLICATION_EVENT = "APPLICATION_EVENT"
    EXECUTION_TRACE = "EXECUTION_TRACE"


class CriterionStatus(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    UNKNOWN = "UNKNOWN"


V_TERMINAL = {
    VerificationStatus.COMPLETED,
    VerificationStatus.INCONCLUSIVE,
    VerificationStatus.FAILED,
    VerificationStatus.CANCELLED,
}
V_TRANSITIONS = {
    VerificationStatus.CREATED: {
        VerificationStatus.COLLECTING_EVIDENCE,
        VerificationStatus.CANCELLED,
        VerificationStatus.FAILED,
    },
    VerificationStatus.COLLECTING_EVIDENCE: {
        VerificationStatus.EVALUATING,
        VerificationStatus.INCONCLUSIVE,
        VerificationStatus.CANCELLED,
        VerificationStatus.FAILED,
    },
    VerificationStatus.EVALUATING: {
        VerificationStatus.COMPLETED,
        VerificationStatus.INCONCLUSIVE,
        VerificationStatus.CANCELLED,
        VerificationStatus.FAILED,
    },
}


@dataclass(frozen=True)
class TargetReference:
    record_id: str
    field: str = "status"
    application: str = "inventory"

    def __post_init__(self) -> None:
        if self.application != "inventory" or not re.fullmatch(
            r"[A-Z]{1,8}-[0-9]{1,8}", self.record_id
        ):
            raise ValueError("Only an explicit inventory record is supported")
        if self.field not in {
            "id",
            "name",
            "location",
            "status",
            "version",
            "inventory_digest",
            "url",
            "element_visible",
        }:
            raise ValueError("Unsupported read-only assertion field")


@dataclass(frozen=True)
class EvidenceRequirement:
    evidence_type: EvidenceType
    min_count: int = 1

    def __post_init__(self) -> None:
        if not isinstance(self.evidence_type, EvidenceType) or not 1 <= self.min_count <= 10:
            raise ValueError("Invalid bounded evidence requirement")


@dataclass(frozen=True)
class SuccessCriterion:
    task_id: UUID
    description: str
    assertion_type: AssertionType
    expected_value: ExpectedValue
    target_reference: TargetReference
    evidence_requirements: tuple[EvidenceRequirement, ...]
    required: bool = True
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        nonempty(self.description, "Criterion description")
        if len(self.description) > 1000 or not isinstance(self.assertion_type, AssertionType):
            raise ValueError("Invalid criterion")
        if not self.evidence_requirements or len(self.evidence_requirements) > 6:
            raise ValueError("Explicit evidence requirements are mandatory")
        if self.assertion_type == AssertionType.STATE_TRANSITION:
            if not isinstance(self.expected_value, dict) or set(self.expected_value) != {
                "before",
                "after",
            }:
                raise ValueError("Transition assertions require explicit before and after values")
        if self.assertion_type in {
            AssertionType.CONTAINS,
            AssertionType.URL_MATCHES,
        } and not isinstance(self.expected_value, str):
            raise ValueError("String assertions require a string expected value")
        if self.assertion_type == AssertionType.EXISTS and self.expected_value is not True:
            raise ValueError("Exists assertions require expected_value=true")
        if self.assertion_type == AssertionType.NOT_EXISTS and self.expected_value is not False:
            raise ValueError("Not-exists assertions require expected_value=false")
        if (
            self.assertion_type == AssertionType.ELEMENT_VISIBLE
            and type(self.expected_value) is not bool
        ):
            raise ValueError("Element visibility requires an explicit boolean expectation")
        if len(canonical_bytes(self.expected_value)) > 4000:
            raise ValueError("Expected value exceeds bound")


@dataclass(frozen=True)
class BaselineReference:
    artifact_id: UUID
    content_hash: str
    captured_at: datetime
    source_store_id: str
    collection_id: UUID

    def __post_init__(self) -> None:
        aware(self.captured_at)
        if not re.fullmatch(r"[0-9a-f]{64}", self.content_hash):
            raise ValueError("Invalid baseline hash")


@dataclass(frozen=True)
class CriteriaVersion:
    task_id: UUID
    execution_id: UUID
    objective: str
    original_manifest_digest: str
    version: int
    criteria: tuple[SuccessCriterion, ...]
    approved_by: str
    approval_reason: str
    baseline: BaselineReference | None = None
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    digest: str = ""

    def __post_init__(self) -> None:
        aware(self.created_at)
        nonempty(self.objective, "Original approved objective")
        nonempty(self.approved_by, "Criteria approver")
        nonempty(self.approval_reason, "Criteria approval scope")
        if (
            self.version < 1
            or not 1 <= len(self.criteria) <= 30
            or not any(c.required for c in self.criteria)
        ):
            raise ValueError("Criteria version requires bounded required criteria")
        if len({c.id for c in self.criteria}) != len(self.criteria) or any(
            c.task_id != self.task_id for c in self.criteria
        ):
            raise ValueError("Criteria must be unique and belong to this task")
        if not re.fullmatch(r"[0-9a-f]{64}", self.original_manifest_digest):
            raise ValueError("Criteria must bind to an exact approved execution")

    def sealed(self) -> "CriteriaVersion":
        return replace(self, digest=content_hash(canonical_bytes(asdict(replace(self, digest="")))))


@dataclass(frozen=True)
class EvidenceMetadata:
    source_system: str
    collection_method: str
    target_record_id: str
    task_id: UUID
    execution_id: UUID
    verification_id: UUID
    role: str
    source_url: str
    nonce: UUID
    source_store_id: str | None
    content_type: str
    byte_count: int

    def __post_init__(self) -> None:
        if (
            self.role not in {"baseline", "final", "supplementary"}
            or not 0 < self.byte_count <= 5_000_000
        ):
            raise ValueError("Invalid evidence role or size")
        nonempty(self.source_system, "Evidence source system")
        nonempty(self.collection_method, "Evidence collection method")
        if self.content_type not in {"application/json", "image/png"}:
            raise ValueError("Unsupported evidence content type")
        TargetReference(self.target_record_id)


@dataclass(frozen=True)
class Evidence:
    verification_session_id: UUID
    evidence_type: EvidenceType
    source: str
    captured_at: datetime
    artifact_reference: UUID
    content_hash: str
    metadata: EvidenceMetadata
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        aware(self.captured_at)
        nonempty(self.source, "Evidence source")
        if not isinstance(self.evidence_type, EvidenceType) or not re.fullmatch(
            r"[0-9a-f]{64}", self.content_hash
        ):
            raise ValueError("Invalid evidence type or SHA-256 hash")
        if self.verification_session_id != self.metadata.verification_id:
            raise ValueError("Evidence belongs to a different verification session")


@dataclass(frozen=True)
class ValidatedEvidence:
    evidence: Evidence
    content: dict[str, Any]
    valid: bool
    error: str | None = None


@dataclass(frozen=True)
class CriterionResult:
    criterion_id: UUID
    status: CriterionStatus
    observed_value: ExpectedValue
    expected_value: ExpectedValue
    evidence_ids: tuple[UUID, ...]
    explanation: str

    def __post_init__(self) -> None:
        if not isinstance(self.status, CriterionStatus):
            raise ValueError("Invalid criterion result")
        nonempty(self.explanation, "Criterion explanation")


@dataclass(frozen=True)
class VerificationSession:
    task_id: UUID
    execution_id: UUID
    criteria_version_id: UUID
    idempotency_key: str
    id: UUID = field(default_factory=uuid4)
    status: VerificationStatus = VerificationStatus.CREATED
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    final_verdict: VerificationVerdict | None = None
    evidence_ids: tuple[UUID, ...] = ()
    criteria_results: tuple[CriterionResult, ...] = ()
    version: int = 0
    error_code: str | None = None
    limitations: tuple[str, ...] = ()
    correlation_id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if self.final_verdict is not None and not isinstance(
            self.final_verdict, VerificationVerdict
        ):
            raise ValueError("Invalid verification verdict enum")
        aware(self.started_at)
        if self.completed_at:
            aware(self.completed_at)
        if (
            not isinstance(self.status, VerificationStatus)
            or not 1 <= len(self.idempotency_key) <= 80
            or self.version < 0
        ):
            raise ValueError("Invalid verification session")
        if self.status == VerificationStatus.COMPLETED and self.final_verdict not in {
            VerificationVerdict.VERIFIED_SUCCESS,
            VerificationVerdict.VERIFIED_FAILURE,
        }:
            raise ValueError("Completed verification requires a deterministic verdict")
        if (
            self.status
            in {
                VerificationStatus.INCONCLUSIVE,
                VerificationStatus.FAILED,
                VerificationStatus.CANCELLED,
            }
            and self.final_verdict != VerificationVerdict.INCONCLUSIVE
        ):
            raise ValueError(
                "Insufficient or interrupted verification cannot declare success/failure"
            )
        if self.status not in V_TERMINAL and self.final_verdict is not None:
            raise ValueError("An active verifier cannot declare a verdict")

    def transition(
        self,
        status: VerificationStatus,
        verdict: VerificationVerdict | None = None,
        error_code: str | None = None,
    ) -> "VerificationSession":
        if status not in V_TRANSITIONS.get(self.status, set()):
            raise ExecutionError(
                "INVALID_VERIFICATION_TRANSITION", f"Cannot transition {self.status} to {status}"
            )
        if status in {
            VerificationStatus.INCONCLUSIVE,
            VerificationStatus.FAILED,
            VerificationStatus.CANCELLED,
        }:
            verdict = VerificationVerdict.INCONCLUSIVE
        return replace(
            self,
            status=status,
            version=self.version + 1,
            final_verdict=verdict,
            error_code=error_code,
            completed_at=datetime.now(UTC) if status in V_TERMINAL else None,
        )

    def changed(self, **values: Any) -> "VerificationSession":
        if "status" in values or "final_verdict" in values:
            raise ValueError("Use transition for verification status/verdict changes")
        return replace(self, version=self.version + 1, **values)


@dataclass(frozen=True)
class VerificationBundle:
    session: VerificationSession
    criteria_version: CriteriaVersion
    evidence: tuple[Evidence, ...] = ()


@dataclass(frozen=True)
class VerificationEvent:
    verification_id: UUID
    execution_id: UUID
    event_type: str
    payload: dict[str, Scalar] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    id: UUID = field(default_factory=uuid4)
    sequence: int = 0


def aggregate_verdict(
    criteria: tuple[SuccessCriterion, ...], results: tuple[CriterionResult, ...]
) -> VerificationVerdict:
    by_id = {result.criterion_id: result for result in results}
    required = [
        by_id[c.id].status if c.id in by_id else CriterionStatus.UNKNOWN
        for c in criteria
        if c.required
    ]
    if CriterionStatus.FAIL in required:
        return VerificationVerdict.VERIFIED_FAILURE
    if required and all(status == CriterionStatus.PASS for status in required):
        return VerificationVerdict.VERIFIED_SUCCESS
    return VerificationVerdict.INCONCLUSIVE
