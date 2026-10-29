from datetime import datetime

import pytest

from inti.domain.entities import (
    AgentAction,
    ExecutionResult,
    Observation,
    Task,
    VerificationResult,
    VisionAnalysis,
)
from inti.domain.enums import ActionType, TaskStatus


def test_task_lifecycle() -> None:
    task = Task("Observe inventory")
    task.transition(TaskStatus.RUNNING)
    task.transition(TaskStatus.COMPLETED)
    with pytest.raises(ValueError):
        task.transition(TaskStatus.RUNNING)


def test_failure_lifecycle() -> None:
    task = Task("Observe")
    with pytest.raises(ValueError):
        task.transition(TaskStatus.COMPLETED)
    task.transition(TaskStatus.RUNNING)
    task.transition(TaskStatus.FAILED)
    assert task.status == TaskStatus.FAILED


@pytest.mark.parametrize(
    "kwargs",
    [
        {"width": 1},
        {"height": 2000},
        {"source_url": "file:///secret"},
        {"timestamp": datetime(2026, 1, 1)},
    ],
)
def test_observation_invariants(kwargs: dict) -> None:
    values = {
        "source_url": "http://localhost:8001/",
        "page_title": "Demo",
        "width": 1440,
        "height": 900,
    } | kwargs
    with pytest.raises(ValueError):
        Observation(**values)


def test_contract_validation() -> None:
    for construct in [
        lambda: Task(" "),
        lambda: AgentAction(ActionType.CLICK, ""),
        lambda: ExecutionResult(False, ""),
        lambda: VerificationResult(True, ""),
        lambda: VisionAnalysis("", "summary"),
    ]:
        with pytest.raises(ValueError):
            construct()
    assert AgentAction(ActionType.OBSERVE, "demo").target == "demo"
    assert ExecutionResult(True, "Captured").success
    assert VerificationResult(True, "Screenshot").verified
