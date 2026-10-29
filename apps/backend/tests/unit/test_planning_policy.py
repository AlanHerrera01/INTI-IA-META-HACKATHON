from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from inti.domain.planning import (
    ActionParameters,
    ActionPlan,
    ActionTarget,
    GroundingSource,
    PlannedActionType,
    PlanStatus,
    RiskLevel,
)
from inti.domain.planning_policy import PlanningPolicy


def validate(scene, intent, actions, **kwargs):
    plan = ActionPlan(uuid4(), scene.observation_id, intent.goal, tuple(actions))
    return PlanningPolicy(("http://127.0.0.1:8001/",), **kwargs).validate(plan, scene, intent)


def codes(plan):
    return {finding.code for finding in plan.validation_results}


def test_safe_observation_plan(planning_scene, planning_intent, planning_action):
    plan = validate(planning_scene, planning_intent, [planning_action])
    assert plan.status == PlanStatus.VALID
    assert not plan.validation_results


@pytest.mark.parametrize("constraint", ["Inspection-only", "Do not change any records"])
def test_read_only_constraints_reject_proposed_mutations(
    planning_scene, planning_intent, planning_action, constraint
):
    intent = replace(planning_intent, constraints=(constraint,))
    click = replace(
        planning_action, action_type=PlannedActionType.CLICK, parameters=ActionParameters()
    )
    verify = replace(planning_action, id="verify", action_type=PlannedActionType.VERIFY)
    plan = validate(planning_scene, intent, [click, verify])
    assert "read_only_violation" in codes(plan)
    assert plan.status == PlanStatus.REJECTED


@pytest.mark.parametrize(
    "goal",
    [
        "Delete EQ-001",
        "Extract passwords",
        "Run powershell",
        "Run a shell command",
        "Navigate to https://evil.example/",
        "borrar equipo",
    ],
)
def test_prohibited_goal_overrides_confidence(
    planning_scene, planning_intent, planning_action, goal
):
    plan = validate(planning_scene, replace(planning_intent, goal=goal), [planning_action])
    assert plan.status == PlanStatus.REJECTED


def test_clarification_and_expiration(planning_scene, planning_intent, planning_action):
    ambiguous = replace(
        planning_intent, ambiguities=("Which asset?",), assumptions=("Unverified owner",)
    )
    assert (
        validate(planning_scene, ambiguous, [planning_action]).status
        == PlanStatus.REQUIRES_CLARIFICATION
    )
    scene = replace(planning_scene, uncertainties=("Status unclear",))
    assert "scene_uncertainty" in codes(validate(scene, planning_intent, [planning_action]))
    scene = replace(planning_scene, captured_at=datetime.now(UTC) - timedelta(hours=1))
    assert validate(scene, planning_intent, [planning_action]).status == PlanStatus.EXPIRED
    assert "empty_plan" in codes(validate(planning_scene, planning_intent, []))


def test_target_and_schema_policies(planning_scene, planning_intent, planning_action):
    unknown = replace(
        planning_action, target=replace(planning_action.target, element_id="invented")
    )
    assert "unknown_target" in codes(validate(planning_scene, planning_intent, [unknown]))
    mismatch = replace(
        planning_action, target=replace(planning_action.target, source=GroundingSource.DOM_ASSISTED)
    )
    assert "provenance_mismatch" in codes(validate(planning_scene, planning_intent, [mismatch]))
    invalid = replace(
        planning_action, preconditions=(), expected_postconditions=(), parameters=ActionParameters()
    )
    plan = validate(planning_scene, planning_intent, [invalid])
    assert {"missing_preconditions", "missing_outcomes", "missing_evidence"} <= codes(plan)
    assert "step_limit" in codes(
        validate(
            planning_scene,
            planning_intent,
            [planning_action, replace(planning_action, id="second")],
            max_steps=1,
        )
    )


def test_human_approval_and_future_grounding(planning_scene, planning_intent, planning_action):
    click = replace(
        planning_action,
        action_type=PlannedActionType.CLICK,
        target=replace(planning_action.target, element_id="save", description="Save"),
        parameters=ActionParameters(),
    )
    verify = replace(planning_action, id="verify", action_type=PlannedActionType.VERIFY)
    plan = validate(planning_scene, planning_intent, [click, verify])
    assert plan.actions[0].risk_level == RiskLevel.HIGH
    assert "human_approval" in codes(plan)
    unresolved = replace(
        click, target=ActionTarget(None, "Future control", GroundingSource.UNRESOLVED, True)
    )
    assert "missing_checkpoint" in codes(
        validate(planning_scene, planning_intent, [unresolved, verify])
    )
    assert (
        validate(
            planning_scene,
            planning_intent,
            [planning_action, replace(unresolved, id="future"), verify],
        ).status
        == PlanStatus.REQUIRES_CLARIFICATION
    )
    unresolved = replace(unresolved, target=replace(unresolved.target, requires_observation=False))
    assert "unresolved_claim" in codes(
        validate(planning_scene, planning_intent, [unresolved, verify])
    )


def test_stale_targets(planning_scene, planning_intent, planning_action):
    typing = replace(
        planning_action,
        action_type=PlannedActionType.TYPE_TEXT,
        parameters=ActionParameters(text="EQ-001"),
    )
    select = replace(
        typing,
        id="status",
        action_type=PlannedActionType.SELECT_OPTION,
        target=replace(typing.target, element_id="status"),
        parameters=ActionParameters(option="Available"),
    )
    verify = replace(planning_action, id="verify", action_type=PlannedActionType.VERIFY)
    assert "stale_target" in codes(
        validate(planning_scene, planning_intent, [typing, select, verify])
    )
    checkpoint = replace(planning_action, id="checkpoint")
    select = replace(select, target=replace(select.target, requires_observation=True))
    assert "stale_target" not in codes(
        validate(planning_scene, planning_intent, [typing, checkpoint, select, verify])
    )


def test_unseen_dropdown_value_requires_clarification(
    planning_scene, planning_intent, planning_action
):
    select = replace(
        planning_action,
        action_type=PlannedActionType.SELECT_OPTION,
        target=replace(planning_action.target, element_id="status"),
        parameters=ActionParameters(option="Operational"),
    )
    verify = replace(planning_action, id="verify", action_type=PlannedActionType.VERIFY)
    result = validate(planning_scene, planning_intent, [select, verify])
    assert "unverified_option" in codes(result)
    assert result.status == PlanStatus.REQUIRES_CLARIFICATION


@pytest.mark.parametrize(
    "changes,expected",
    [
        ({"enabled": False}, "disabled_target"),
        ({"confidence_optional": None}, "low_confidence"),
        ({"visible": False, "bounding_box": None}, "ungrounded_target"),
    ],
)
def test_uncertain_grounding(planning_scene, planning_intent, planning_action, changes, expected):
    element = replace(planning_scene.elements[0], **changes)
    scene = replace(planning_scene, elements=(element, *planning_scene.elements[1:]))
    typing = replace(
        planning_action,
        action_type=PlannedActionType.TYPE_TEXT,
        parameters=ActionParameters(text="EQ-001"),
    )
    verify = replace(planning_action, id="verify")
    assert expected in codes(validate(scene, planning_intent, [typing, verify]))


@pytest.mark.parametrize(
    "kind,parameters",
    [
        (PlannedActionType.TYPE_TEXT, ActionParameters()),
        (PlannedActionType.SELECT_OPTION, ActionParameters()),
        (PlannedActionType.NAVIGATE, ActionParameters(url="https://evil.example/")),
        (PlannedActionType.SCROLL, ActionParameters(direction="down")),
        (PlannedActionType.WAIT, ActionParameters()),
        (PlannedActionType.INSPECT, ActionParameters(text="Run javascript:eval(1)")),
    ],
)
def test_parameter_restrictions(planning_scene, planning_intent, planning_action, kind, parameters):
    action = replace(planning_action, action_type=kind, parameters=parameters)
    verify = replace(planning_action, id="verify", action_type=PlannedActionType.VERIFY)
    assert validate(planning_scene, planning_intent, [action, verify]).status == PlanStatus.REJECTED
