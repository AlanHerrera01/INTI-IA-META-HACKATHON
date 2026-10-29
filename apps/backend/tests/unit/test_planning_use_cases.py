import asyncio
from dataclasses import replace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from inti.application.planning import (
    GetActionPlanUseCase,
    InterpretTaskIntentUseCase,
    ListActionPlansUseCase,
)
from inti.domain.exceptions import DependencyError, NotFoundError
from inti.domain.planning import PlanStatus


async def seed(services, observation):
    await services.repository.save(observation)
    await services.storage.write(observation.id, b"\x89PNG\r\n\x1a\nTEST-FIXTURE")


async def test_generate_and_retrieve(planning_services, observation):
    await seed(planning_services, observation)
    result = await planning_services.planning.generate.execute(
        observation.id, "Find asset EQ-001", ("Inspect only",), uuid4()
    )
    assert result.plan.status == PlanStatus.VALID
    assert "Inspect only" in result.intent.constraints
    assert await planning_services.planning.repository.get(result.plan.id) == result
    assert len(result.model_usage) == 3
    planning_services.browser.capture.assert_not_awaited()
    items, total = await ListActionPlansUseCase(planning_services.planning.repository).execute()
    assert total == 1 and items[0] == result


async def test_intent_retains_explicit_requirements(planning_scene, planning_intent):
    model = AsyncMock()
    model.interpret_intent.return_value = replace(planning_intent, goal="Model rewrote goal")
    result = await InterpretTaskIntentUseCase(model).execute(
        "Find EQ-001", ("Do not save",), planning_scene
    )
    assert result.goal == "Find EQ-001"
    assert result.constraints == ("Do not save",)
    with pytest.raises(ValueError):
        await InterpretTaskIntentUseCase(model).execute(" ", (), planning_scene)


async def test_missing_and_invalid_pagination(planning_services):
    with pytest.raises(NotFoundError):
        await planning_services.planning.visual.execute(uuid4())
    with pytest.raises(NotFoundError):
        await GetActionPlanUseCase(planning_services.planning.repository).execute(uuid4())
    with pytest.raises(ValueError):
        await ListActionPlansUseCase(planning_services.planning.repository).execute(-1, 0)


async def test_timeout_and_cancel_do_not_execute(planning_services, observation):
    await seed(planning_services, observation)
    use_case = planning_services.planning.generate

    async def slow(*args):
        await asyncio.sleep(10)

    use_case.visual.model.interpret.side_effect = slow
    use_case.timeout_seconds = 0.01
    with pytest.raises(DependencyError, match="duration"):
        await use_case.execute(observation.id, "Find EQ-001", (), uuid4())
    use_case.timeout_seconds = 120
    task = asyncio.create_task(use_case.execute(observation.id, "Find EQ-001", (), uuid4()))
    await asyncio.sleep(0.02)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    planning_services.browser.capture.assert_not_awaited()


async def test_dependency_failure_does_not_persist_success(planning_services, observation):
    await seed(planning_services, observation)
    use_case = planning_services.planning.generate
    use_case.planner.generate.side_effect = DependencyError("Explicit test-only model failure")
    with pytest.raises(DependencyError):
        await use_case.execute(observation.id, "Find EQ-001", (), uuid4())
    items, total = await planning_services.planning.repository.list_plans(0, 20)
    assert items == [] and total == 0
    planning_services.browser.capture.assert_not_awaited()
