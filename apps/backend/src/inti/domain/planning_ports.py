from typing import Protocol
from uuid import UUID

from inti.domain.entities import Observation
from inti.domain.planning import (
    ActionPlan,
    ModelUsage,
    PlannedAction,
    PlanningEvent,
    PlanningResult,
    TaskIntent,
    VisualScene,
)


class VisualReasoningPort(Protocol):
    async def interpret(self, observation: Observation, goal: str | None) -> VisualScene: ...


class TaskIntentPort(Protocol):
    async def interpret_intent(
        self, goal: str, constraints: tuple[str, ...], scene: VisualScene
    ) -> TaskIntent: ...


class PlanningModelPort(Protocol):
    async def generate(
        self, intent: TaskIntent, scene: VisualScene
    ) -> tuple[tuple[PlannedAction, ...], ModelUsage]: ...


class VisualGroundingPort(Protocol):
    def validate(self, scene: VisualScene, observation: Observation) -> VisualScene: ...


class PlanValidationPort(Protocol):
    def validate(self, plan: ActionPlan, scene: VisualScene, intent: TaskIntent) -> ActionPlan: ...


class PlanRepositoryPort(Protocol):
    async def save_scene(self, scene: VisualScene) -> None: ...
    async def save(self, result: PlanningResult, event: PlanningEvent) -> None: ...
    async def get(self, id: UUID) -> PlanningResult | None: ...
    async def list_plans(self, offset: int, limit: int) -> tuple[list[PlanningResult], int]: ...
    async def events(self, id: UUID) -> list[PlanningEvent]: ...
    async def record_event(self, event: PlanningEvent) -> None: ...


class PlanningTelemetryPort(Protocol):
    async def record(self, event: PlanningEvent) -> None: ...
