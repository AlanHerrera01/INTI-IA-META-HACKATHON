from dataclasses import replace
from datetime import datetime
from uuid import uuid4

import pytest

from inti.domain.planning import (
    ActionParameters,
    ActionPlan,
    ActionTarget,
    BoundingBox,
    CoordinateSystem,
    GroundingSource,
    ModelUsage,
    PlannedActionType,
    PlanStatus,
    TaskIntent,
    ValidationFinding,
    Viewport,
)


@pytest.mark.parametrize(
    "values",
    [
        (-1, 0, 2, 2),
        (0, -1, 2, 2),
        (0, 0, 0, 2),
        (0, 0, 2, -1),
        (float("nan"), 0, 2, 2),
        (0, 0, float("inf"), 1),
    ],
)
def test_box_invariants(values):
    with pytest.raises(ValueError):
        BoundingBox(*values, CoordinateSystem.PIXELS)


def test_coordinate_conversion_and_bounds():
    viewport = Viewport(1440, 900)
    normalized = BoundingBox(100, 200, 300, 100, CoordinateSystem.NORMALIZED)
    pixels = normalized.pixels(viewport)
    assert (pixels.x, pixels.y, pixels.width, pixels.height) == (144, 180, 432, 90)
    assert pixels.pixels(viewport) is pixels
    with pytest.raises(ValueError):
        BoundingBox(900, 0, 200, 100, CoordinateSystem.NORMALIZED)
    with pytest.raises(ValueError):
        BoundingBox(1400, 0, 100, 100, CoordinateSystem.PIXELS).validate_viewport(viewport)
    with pytest.raises(ValueError):
        BoundingBox(0, 0, 1, 1, "mixed")
    with pytest.raises(ValueError):
        Viewport(100, 900)


def test_visual_element_invariants(planning_scene):
    element = planning_scene.elements[0]
    for changes in (
        {"id": ""},
        {"description": ""},
        {"element_type": "script"},
        {"source": "fake"},
        {"confidence_optional": 2},
        {"visible": False},
        {"source": GroundingSource.UNRESOLVED},
    ):
        with pytest.raises(ValueError):
            replace(element, **changes)
    with pytest.raises(ValueError):
        replace(planning_scene, elements=(element, element))
    with pytest.raises(ValueError):
        replace(planning_scene, generated_at=datetime(2026, 1, 1))
    with pytest.raises(ValueError):
        replace(planning_scene, summary="")
    with pytest.raises(ValueError):
        replace(
            planning_scene,
            elements=(
                replace(
                    element, bounding_box=BoundingBox(1800, 0, 100, 100, CoordinateSystem.PIXELS)
                ),
            ),
        )


def test_intent_action_plan_invariants(planning_action, observation):
    with pytest.raises(ValueError):
        TaskIntent("Find", "Inventory", (), "", ())
    assert TaskIntent("Find", "Inventory", (), "", ("Which asset?",)).ambiguities
    with pytest.raises(ValueError):
        ActionTarget("search", "Unknown", GroundingSource.UNRESOLVED, True)
    with pytest.raises(ValueError):
        ActionTarget(None, "Known", GroundingSource.MODEL_VISUAL, False)
    with pytest.raises(ValueError):
        ActionTarget(None, "Unknown", "fake", True)
    for parameters in (
        {"amount": 0},
        {"seconds": 31},
        {"direction": "diagonal"},
        {"text": "x" * 2001},
    ):
        with pytest.raises(ValueError):
            ActionParameters(**parameters)
    with pytest.raises(ValueError):
        replace(planning_action, action_type="run_script")
    with pytest.raises(ValueError):
        replace(planning_action, risk_level="SAFE")
    plan = ActionPlan(uuid4(), observation.id, "Inspect", (planning_action,))
    with pytest.raises(ValueError):
        replace(plan, status="executing")
    with pytest.raises(ValueError):
        replace(plan, actions=(planning_action, planning_action))
    assert plan.status == PlanStatus.DRAFT
    with pytest.raises(ValueError):
        ModelUsage("", "test")
    with pytest.raises(ValueError):
        ModelUsage("test", "id", -1)
    with pytest.raises(ValueError):
        ValidationFinding("code", "message", "success")
    assert PlannedActionType.VERIFY.value == "verify"
