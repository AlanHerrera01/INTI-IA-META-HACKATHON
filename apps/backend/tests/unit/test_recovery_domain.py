from dataclasses import replace
from uuid import uuid4

import pytest
from test_execution_policy import prepare
from test_execution_policy import prepared as prepared

from inti.domain.execution import ExecutionBundle, ExecutionError, ExecutionSession, GroundingMode
from inti.domain.planning import ActionParameters, PlannedActionType, RiskLevel, Viewport
from inti.domain.recovery import (
    R_TERMINAL,
    R_TRANSITIONS,
    FailureType,
    RecoveryBudget,
    RecoveryDiagnosis,
    RecoverySession,
    RecoveryStatus,
    RecoveryStrategy,
    StrategyType,
)
from inti.domain.recovery_policy import RecoveryPolicy, RecoveryStrategySelector


@pytest.mark.parametrize("source", list(RecoveryStatus))
def test_recovery_state_machine(source):
    state = RecoverySession(
        uuid4(), uuid4(), FailureType.TARGET_NOT_FOUND, RecoveryBudget(), status=source
    )
    for target in RecoveryStatus:
        allowed = set(R_TRANSITIONS.get(source, set()))
        if source not in R_TERMINAL:
            allowed |= {RecoveryStatus.CANCELLED, RecoveryStatus.ESCALATED, RecoveryStatus.FAILED}
        allowed.discard(source)
        if target in allowed:
            moved = state.transition(target)
            assert moved.status == target and moved.version == 1
        else:
            with pytest.raises(ExecutionError):
                state.transition(target)


@pytest.mark.parametrize(
    "value",
    [
        {"max_attempts": 0},
        {"max_duration_seconds": 601},
        {"max_model_calls": 0},
        {"max_actions": 31},
        {"max_tokens_optional": 255},
        {"max_identical_failures": 6},
    ],
)
def test_budget_invariants(value):
    with pytest.raises(ValueError):
        RecoveryBudget(**value)


@pytest.mark.parametrize(
    "counter,flags",
    [
        ({"attempts_count": 3}, {"attempt": True}),
        ({"model_calls": 5}, {"model": True}),
        ({"actions_used": 10}, {"action": True}),
        ({"identical_failures": 2}, {}),
        ({"tokens_used": None}, {}),
        ({"tokens_used": 256}, {}),
    ],
)
def test_budget_exhaustion_and_unknown_token_usage(counter, flags):
    state = RecoverySession(
        uuid4(), uuid4(), FailureType.UNKNOWN, RecoveryBudget(max_tokens_optional=256), **counter
    )
    with pytest.raises(ExecutionError, match="budget"):
        state.check_budget(**flags)


def diagnosis(action):
    return RecoveryDiagnosis(
        FailureType.ELEMENT_MOVED,
        ("Fixture control moved",),
        ("Fixture hypothesis",),
        "Fixture",
        (),
        (),
        (),
        (uuid4(), uuid4()),
        Viewport(1440, 900),
        (
            RecoveryStrategy(
                StrategyType.RELOCATE_TARGET,
                "Fixture",
                (action,),
                RiskLevel.LOW,
                0.1,
                "Original checks pass",
            ),
        ),
    )


def test_policy_inherits_only_exact_contract_and_rejects_scope_changes(prepared):
    policy, result, contract = prepared
    manifest = prepare(policy, result, contract)
    bundle = ExecutionBundle(ExecutionSession(result.plan.task_id, result.plan.id), manifest)
    action = manifest.actions[0]
    guard = RecoveryPolicy(policy.allowed_urls)
    plan = guard.prepare(bundle, 0, diagnosis(replace(action, id=uuid4())))
    assert not plan.decision.requires_approval
    guard.authorized(plan, bundle)
    for changed in [
        replace(action, expected_postconditions=action.preconditions + action.preconditions),
        replace(action, preconditions=action.preconditions + action.preconditions),
        replace(
            action,
            action_type=PlannedActionType.TYPE_TEXT,
            parameters=ActionParameters(text="Other record"),
        ),
    ]:
        with pytest.raises(ExecutionError) as error:
            guard.prepare(bundle, 0, diagnosis(changed))
        assert error.value.code == "RECOVERY_SCOPE_CHANGED"
    with pytest.raises(ExecutionError):
        guard.authorized(replace(plan, objective="Unapproved goal"), bundle)
    with pytest.raises(ExecutionError) as error:
        guard.prepare(
            replace(bundle, manifest=replace(manifest, grounding_mode=GroundingMode.VISUAL_ONLY)),
            0,
            diagnosis(action),
        )
    assert error.value.code == "VISUAL_RECOVERY_UNSUPPORTED"
    with pytest.raises(ExecutionError):
        guard.prepare(bundle, 0, replace(diagnosis(action), uncertainties=("Which asset?",)))


def test_strategy_selection_ignores_confidence():
    from inti.domain.execution import BrowserCheck, BrowserTarget, CheckKind, ExecutableAction

    target = BrowserTarget("button", "Fixture")
    check = BrowserCheck(CheckKind.VISIBLE, target)
    action = ExecutableAction(
        uuid4(),
        "fixture",
        PlannedActionType.CLICK,
        target,
        ActionParameters(),
        (check,),
        (check,),
        RiskLevel.LOW,
    )
    d = diagnosis(action)
    invasive = replace(
        d.strategies[0], strategy_type=StrategyType.REPLAN_REMAINING_ACTIONS, confidence_optional=1
    )
    assert (
        RecoveryStrategySelector().select(replace(d, strategies=(invasive, *d.strategies)))
        == d.strategies[0]
    )
