from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import TypeAdapter

from inti.domain.execution import (
    ActionContract,
    BrowserCheck,
    BrowserTarget,
    CheckKind,
    ExecutableAction,
    ExecutionBundle,
    ExecutionError,
    ExecutionLimits,
    ExecutionSession,
    GroundingMode,
    fingerprint,
)
from inti.domain.execution_policy import ExecutionPolicy
from inti.domain.planning import (
    ActionParameters,
    ActionPlan,
    PlannedActionType,
    PlanningResult,
    PlanStatus,
    RiskLevel,
)
from inti.domain.planning_policy import PlanningPolicy


@pytest.fixture
def prepared(planning_scene, planning_intent, planning_action):
    validator = PlanningPolicy(("http://127.0.0.1:8001/",))
    plan = validator.validate(
        ActionPlan(
            uuid4(), planning_scene.observation_id, planning_intent.goal, (planning_action,)
        ),
        planning_scene,
        planning_intent,
    )
    now = datetime.now(UTC)
    result = PlanningResult(
        plan, planning_scene, planning_intent, (), (), (), (), "Test plan", now, now, uuid4()
    )
    target = BrowserTarget("textbox", "Search equipment")
    check = BrowserCheck(CheckKind.VISIBLE, target)
    contract = ActionContract(planning_action.id, target, (check,), (check,))
    return (
        ExecutionPolicy(validator, ("http://127.0.0.1:8001/",), ExecutionLimits()),
        result,
        contract,
    )


def prepare(policy, result, contract, mode=GroundingMode.HYBRID_DOM):
    return policy.prepare(result, (contract,), "http://127.0.0.1:8001/", mode)


def test_digest_roundtrip_and_tampering(prepared):
    policy, result, contract = prepared
    manifest = prepare(policy, result, contract)
    adapter = TypeAdapter(type(manifest))
    restored = adapter.validate_json(adapter.dump_json(manifest))
    assert fingerprint(replace(restored, digest="")) == manifest.digest
    bundle = ExecutionBundle(ExecutionSession(result.plan.task_id, result.plan.id), manifest)
    with pytest.raises(ExecutionError) as denied:
        policy.authorized(bundle, result)
    assert denied.value.code == "APPROVAL_REQUIRED"
    with pytest.raises(ExecutionError):
        policy.authorized(
            replace(
                bundle,
                plan_approved=True,
                manifest=replace(manifest, initial_url="file:///etc/passwd"),
            ),
            result,
        )
    with pytest.raises(ExecutionError):
        policy.authorized(
            replace(bundle, plan_approved=True), replace(result, validation_summary="changed")
        )
    with pytest.raises(ExecutionError):
        policy.authorized(replace(bundle, plan_approved=True), result)


@pytest.mark.parametrize(
    "case,code",
    [
        ("stale", "PLAN_EXPIRED"),
        ("rejected", "PLAN_NOT_VALID"),
        ("ambiguity", "BUSINESS_CLARIFICATION"),
        ("binding", "BINDING_CHANGED"),
        ("missing", "CONTRACT_REQUIRED"),
        ("selector", "SELECTOR_REQUIRED"),
        ("url", "URL_DENIED"),
    ],
)
def test_execution_preparation_rejects_unsafe_inputs(prepared, case, code):
    policy, result, contract = prepared
    mode = GroundingMode.HYBRID_DOM
    if case == "stale":
        result = replace(
            result, plan=replace(result.plan, created_at=datetime.now(UTC) - timedelta(hours=1))
        )
    if case == "rejected":
        result = replace(result, plan=replace(result.plan, status=PlanStatus.REJECTED))
    if case == "ambiguity":
        result = replace(result, intent=replace(result.intent, ambiguities=("Which asset?",)))
    if case == "binding":
        contract = replace(contract, target=BrowserTarget("button", "Different"))
    if case == "missing":
        contract = replace(contract, planned_action_id="not-in-plan")
    if case == "selector":
        mode = GroundingMode.SELECTOR_BASED
    if case == "url":
        contract = replace(
            contract, postconditions=(BrowserCheck(CheckKind.URL, None, "https://example.com/"),)
        )
    with pytest.raises(ExecutionError) as error:
        prepare(policy, result, contract, mode)
    assert error.value.code == code


@pytest.mark.parametrize(
    "factory",
    [
        lambda: BrowserTarget("script", "Eval"),
        lambda: BrowserTarget("button", ""),
        lambda: BrowserTarget("button", "Save", "body > button"),
        lambda: BrowserCheck(CheckKind.VISIBLE, None),
        lambda: BrowserCheck(CheckKind.TEXT, BrowserTarget("text", "Receipt")),
        lambda: ActionContract("id", None, (), ()),
        lambda: ExecutionLimits(max_actions=0),
        lambda: ExecutionLimits(action_timeout_seconds=0),
    ],
)
def test_action_contract_validation(factory):
    with pytest.raises(ValueError):
        factory()


def test_executable_parameter_validation(prepared):
    _, _, contract = prepared
    with pytest.raises(ValueError):
        ExecutableAction(
            uuid4(),
            "step",
            PlannedActionType.TYPE_TEXT,
            contract.target,
            ActionParameters(),
            contract.preconditions,
            contract.postconditions,
            RiskLevel.LOW,
        )
