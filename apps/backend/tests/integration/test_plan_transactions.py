from dataclasses import replace
from uuid import uuid4

import pytest

from inti.domain.exceptions import DependencyError
from inti.domain.planning import PlanStatus


async def test_failed_completion_event_rolls_back_plan_update(planning_services, observation):
    await planning_services.repository.save(observation)
    await planning_services.storage.write(observation.id, b"\x89PNG\r\n\x1a\nTEST-FIXTURE")
    service = planning_services.planning
    result = await service.generate.execute(observation.id, "Find EQ-001", (), uuid4())
    events = await service.repository.events(result.plan.id)
    duplicate_event = events[-1]
    changed = replace(result, plan=replace(result.plan, status=PlanStatus.REJECTED))
    with pytest.raises(DependencyError):
        await service.repository.save(changed, duplicate_event)
    assert await service.repository.get(result.plan.id) == result
