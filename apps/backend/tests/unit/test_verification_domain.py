from dataclasses import replace
from datetime import UTC, datetime
from itertools import product
from uuid import uuid4

import pytest

from inti.domain.assertions import AssertionEvaluator
from inti.domain.execution import ExecutionError
from inti.domain.verification import (
    V_TRANSITIONS,
    AssertionType,
    CriterionResult,
    CriterionStatus,
    Evidence,
    EvidenceMetadata,
    EvidenceRequirement,
    EvidenceType,
    SuccessCriterion,
    TargetReference,
    ValidatedEvidence,
    VerificationSession,
    VerificationStatus,
    VerificationVerdict,
    aggregate_verdict,
    canonical_bytes,
    content_hash,
)


def criterion(kind=AssertionType.EQUALS, expected="Operational", field="status", required=True):
    return SuccessCriterion(
        uuid4(),
        "Explicit unit-test criterion",
        kind,
        expected,
        TargetReference("PC-104", field),
        (EvidenceRequirement(EvidenceType.DATABASE_STATE),),
        required,
    )


def view(
    status="Operational",
    version=2,
    role="final",
    kind=EvidenceType.DATABASE_STATE,
    records=None,
    nonce=None,
):
    content = {
        "records": records
        if records is not None
        else [
            {
                "id": "PC-104",
                "name": "Synthetic PC",
                "location": "Lab",
                "status": status,
                "version": version,
            }
        ]
    }
    data = canonical_bytes(content)
    id = uuid4()
    meta = EvidenceMetadata(
        "UNIT TEST FIXTURE",
        "Unit-test input only",
        "PC-104",
        uuid4(),
        uuid4(),
        id,
        role,
        "http://127.0.0.1/",
        nonce or uuid4(),
        "fixture-store",
        "application/json",
        len(data),
    )
    evidence = Evidence(
        id, kind, "UNIT TEST FIXTURE", datetime.now(UTC), uuid4(), content_hash(data), meta
    )
    return ValidatedEvidence(evidence, content, True)


@pytest.mark.parametrize("source", list(VerificationStatus))
def test_verification_state_pairs(source):
    final = (
        VerificationVerdict.VERIFIED_SUCCESS
        if source == VerificationStatus.COMPLETED
        else (
            VerificationVerdict.INCONCLUSIVE
            if source
            in {
                VerificationStatus.INCONCLUSIVE,
                VerificationStatus.FAILED,
                VerificationStatus.CANCELLED,
            }
            else None
        )
    )
    session = VerificationSession(
        uuid4(), uuid4(), uuid4(), "test", status=source, final_verdict=final
    )
    for target in VerificationStatus:
        if target in V_TRANSITIONS.get(source, set()):
            verdict = (
                VerificationVerdict.VERIFIED_SUCCESS
                if target == VerificationStatus.COMPLETED
                else None
            )
            assert session.transition(target, verdict).status == target
        else:
            with pytest.raises(ExecutionError):
                session.transition(target)


@pytest.mark.parametrize("statuses", list(product(list(CriterionStatus), repeat=3)))
def test_required_criteria_control_verdict(statuses):
    criteria = (criterion(), criterion(), criterion(required=False))
    results = tuple(
        CriterionResult(c.id, status, None, c.expected_value, (), "Unit-test result")
        for c, status in zip(criteria, statuses, strict=True)
    )
    expected = (
        VerificationVerdict.VERIFIED_FAILURE
        if CriterionStatus.FAIL in statuses[:2]
        else VerificationVerdict.VERIFIED_SUCCESS
        if statuses[:2] == (CriterionStatus.PASS, CriterionStatus.PASS)
        else VerificationVerdict.INCONCLUSIVE
    )
    assert aggregate_verdict(criteria, results) == expected
    assert aggregate_verdict(criteria, ()) == VerificationVerdict.INCONCLUSIVE


@pytest.mark.parametrize(
    "kind,expected,status",
    [
        (AssertionType.EQUALS, "Operational", CriterionStatus.PASS),
        (AssertionType.EQUALS, "Inactive", CriterionStatus.FAIL),
        (AssertionType.NOT_EQUALS, "Inactive", CriterionStatus.PASS),
        (AssertionType.NOT_EQUALS, "Operational", CriterionStatus.FAIL),
        (AssertionType.EXISTS, True, CriterionStatus.PASS),
        (AssertionType.NOT_EXISTS, False, CriterionStatus.FAIL),
        (AssertionType.CONTAINS, "ration", CriterionStatus.PASS),
        (AssertionType.CONTAINS, "Inactive", CriterionStatus.FAIL),
    ],
)
def test_deterministic_assertions(kind, expected, status):
    evaluator = AssertionEvaluator()
    check = criterion(kind, expected)
    assert evaluator.evaluate(check, (view(),)).status == status
    assert evaluator.evaluate(check, ()).status == CriterionStatus.UNKNOWN


def test_missing_record_and_insufficient_proof():
    evaluator = AssertionEvaluator()
    missing = view(records=[])
    assert (
        evaluator.evaluate(criterion(AssertionType.EXISTS, True), (missing,)).status
        == CriterionStatus.FAIL
    )
    assert (
        evaluator.evaluate(criterion(AssertionType.NOT_EXISTS, False), (missing,)).status
        == CriterionStatus.PASS
    )
    screenshot = view(kind=EvidenceType.SCREENSHOT)
    check = replace(
        criterion(), evidence_requirements=(EvidenceRequirement(EvidenceType.SCREENSHOT),)
    )
    assert evaluator.evaluate(check, (screenshot,)).status == CriterionStatus.UNKNOWN
    api = view(kind=EvidenceType.READ_ONLY_API_RESPONSE)
    check = replace(
        check, evidence_requirements=(EvidenceRequirement(EvidenceType.READ_ONLY_API_RESPONSE),)
    )
    assert evaluator.evaluate(check, (api,)).status == CriterionStatus.UNKNOWN
    assert (
        evaluator.evaluate(
            criterion(), (replace(view(), valid=False, error="hash mismatch"),)
        ).status
        == CriterionStatus.UNKNOWN
    )


def test_persistence_requires_distinct_consistent_reads():
    evaluator = AssertionEvaluator()
    check = criterion(AssertionType.RECORD_PERSISTED)
    assert evaluator.evaluate(check, (view(),)).status == CriterionStatus.UNKNOWN
    assert evaluator.evaluate(check, (view(), view())).status == CriterionStatus.PASS
    assert (
        evaluator.evaluate(check, (view("Inactive"), view("Inactive"))).status
        == CriterionStatus.FAIL
    )
    nonce = uuid4()
    assert (
        evaluator.evaluate(check, (view(nonce=nonce), view(nonce=nonce))).status
        == CriterionStatus.UNKNOWN
    )
    assert evaluator.evaluate(check, (view(), view("Inactive"))).status == CriterionStatus.UNKNOWN


def test_transition_needs_intact_baseline_and_new_version():
    evaluator = AssertionEvaluator()
    check = criterion(
        AssertionType.STATE_TRANSITION, {"before": "Inactive", "after": "Operational"}
    )
    baseline = view("Inactive", 1, "baseline")
    assert evaluator.evaluate(check, (view(),)).status == CriterionStatus.UNKNOWN
    assert evaluator.evaluate(check, (baseline, view())).status == CriterionStatus.PASS
    assert evaluator.evaluate(check, (baseline, view(version=1))).status == CriterionStatus.FAIL


def test_dom_visibility_and_exact_url():
    evaluator = AssertionEvaluator()
    dom = replace(
        view(kind=EvidenceType.DOM_SNAPSHOT), content={"visible": False, "url": "http://127.0.0.1/"}
    )
    visible = replace(
        criterion(AssertionType.ELEMENT_VISIBLE, False, "element_visible"),
        evidence_requirements=(EvidenceRequirement(EvidenceType.DOM_SNAPSHOT),),
    )
    assert evaluator.evaluate(visible, (dom,)).status == CriterionStatus.PASS
    url = replace(
        criterion(AssertionType.URL_MATCHES, "http://127.0.0.1/", "url"),
        evidence_requirements=(EvidenceRequirement(EvidenceType.DOM_SNAPSHOT),),
    )
    assert evaluator.evaluate(url, (dom,)).status == CriterionStatus.PASS
    assert (
        evaluator.evaluate(replace(url, expected_value="http://example.com/"), (dom,)).status
        == CriterionStatus.FAIL
    )


def test_canonical_hash_and_domain_validation():
    assert canonical_bytes({"b": 1.0, "a": True}) == canonical_bytes({"a": True, "b": 1})
    assert canonical_bytes(True) != canonical_bytes(1)
    assert content_hash(canonical_bytes({"a": 1})) != content_hash(canonical_bytes({"a": 2}))
    for factory in (
        lambda: canonical_bytes(float("nan")),
        lambda: TargetReference("../../file"),
        lambda: TargetReference("PC-104", "arbitrary_sql"),
        lambda: EvidenceRequirement(EvidenceType.DATABASE_STATE, 0),
        lambda: criterion(AssertionType.EXISTS, False),
        lambda: criterion(AssertionType.NOT_EXISTS, True),
        lambda: criterion(AssertionType.STATE_TRANSITION, {"after": "Operational"}),
        lambda: criterion(AssertionType.ELEMENT_VISIBLE, "yes"),
        lambda: VerificationSession(
            uuid4(), uuid4(), uuid4(), "test", status=VerificationStatus.COMPLETED
        ),
    ):
        with pytest.raises(ValueError):
            factory()
