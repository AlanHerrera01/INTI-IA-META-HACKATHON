"""Planning orchestration. No browser/action executor dependency exists here."""

import asyncio
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID, uuid4

from inti.domain.exceptions import DependencyError, NotFoundError
from inti.domain.planning import (
    ActionPlan,
    PlanningEvent,
    PlanningResult,
    TaskIntent,
    VisualScene,
)
from inti.domain.planning_ports import (
    PlanningModelPort,
    PlanningTelemetryPort,
    PlanRepositoryPort,
    PlanValidationPort,
    TaskIntentPort,
    VisualGroundingPort,
    VisualReasoningPort,
)
from inti.domain.ports import ArtifactStoragePort, ObservationRepositoryPort


class InterpretVisualSceneUseCase:
    def __init__(
        self,
        observations: ObservationRepositoryPort,
        storage: ArtifactStoragePort,
        model: VisualReasoningPort,
        grounding: VisualGroundingPort,
        repository: PlanRepositoryPort,
    ) -> None:
        self.observations, self.storage = observations, storage
        self.model, self.grounding, self.repository = model, grounding, repository

    async def execute(self, observation_id: UUID, goal: str | None = None) -> VisualScene:
        observation = await self.observations.get(observation_id)
        if observation is None:
            raise NotFoundError("Observation not found")
        await self.storage.read(observation_id)
        scene = self.grounding.validate(await self.model.interpret(observation, goal), observation)
        await self.repository.save_scene(scene)
        return scene


class InterpretTaskIntentUseCase:
    def __init__(self, model: TaskIntentPort) -> None:
        self.model = model

    async def execute(
        self, goal: str, constraints: tuple[str, ...], scene: VisualScene
    ) -> TaskIntent:
        if not goal.strip():
            raise ValueError("Goal must be nonempty")
        intent = await self.model.interpret_intent(goal, constraints, scene)
        # The model cannot remove explicit constraints or rewrite the user's objective.
        return replace(
            intent, goal=goal, constraints=tuple(dict.fromkeys((*constraints, *intent.constraints)))
        )


class GenerateActionPlanUseCase:
    def __init__(
        self,
        visual: InterpretVisualSceneUseCase,
        intent: InterpretTaskIntentUseCase,
        planner: PlanningModelPort,
        validator: PlanValidationPort,
        repository: PlanRepositoryPort,
        telemetry: PlanningTelemetryPort,
        timeout_seconds: float = 120,
    ) -> None:
        self.visual, self.intent, self.planner = visual, intent, planner
        self.validator, self.repository, self.telemetry = validator, repository, telemetry
        self.timeout_seconds = timeout_seconds

    async def execute(
        self, observation_id: UUID, goal: str, constraints: tuple[str, ...], correlation_id: UUID
    ) -> PlanningResult:
        task_id, started = uuid4(), datetime.now(UTC)

        async def event(kind: str, code: str | None = None) -> None:
            await self.telemetry.record(PlanningEvent(task_id, correlation_id, kind, code=code))

        await event("planning_started")
        try:
            async with asyncio.timeout(self.timeout_seconds):
                scene = await self.visual.execute(observation_id, goal)
                await self.telemetry.record(
                    PlanningEvent(
                        task_id, correlation_id, "scene_interpreted", model_usage=scene.model_usage
                    )
                )
                intent = await self.intent.execute(goal, constraints, scene)
                await self.telemetry.record(
                    PlanningEvent(
                        task_id,
                        correlation_id,
                        "intent_interpreted",
                        model_usage=intent.model_usage,
                    )
                )
                actions, usage = await self.planner.generate(intent, scene)
                usages = tuple(u for u in (scene.model_usage, intent.model_usage, usage) if u)
                plan = self.validator.validate(
                    ActionPlan(task_id, observation_id, goal, actions, model_metadata=usages),
                    scene,
                    intent,
                )
                findings = plan.validation_results
                result = PlanningResult(
                    plan,
                    scene,
                    intent,
                    intent.assumptions,
                    tuple(
                        dict.fromkeys(
                            (
                                *intent.ambiguities,
                                *(f.message for f in findings if f.severity == "clarification"),
                            )
                        )
                    ),
                    tuple(f.message for f in findings if f.severity in {"warning", "error"}),
                    usages,
                    f"{plan.status}: {len(findings)} validation finding(s)",
                    started,
                    datetime.now(UTC),
                    correlation_id,
                )
                # Plan, actions and completion event are committed atomically.
                await self.repository.save(
                    result,
                    PlanningEvent(
                        task_id,
                        correlation_id,
                        "planning_completed",
                        plan_id=plan.id,
                        code=plan.status,
                        model_usage=usage,
                    ),
                )
                return result
        except TimeoutError as exc:
            await event("planning_failed", "planning_timeout")
            raise DependencyError("Planning exceeded the configured duration limit") from exc
        except asyncio.CancelledError:
            await asyncio.shield(event("planning_cancelled", "cancelled"))
            raise
        except Exception:
            await event("planning_failed", "planning_dependency_failure")
            raise


class GetActionPlanUseCase:
    def __init__(self, repository: PlanRepositoryPort) -> None:
        self.repository = repository

    async def execute(self, id: UUID) -> PlanningResult:
        result = await self.repository.get(id)
        if result is None:
            raise NotFoundError("Plan not found")
        return result


class ValidateActionPlanUseCase:
    def __init__(self, repository: PlanRepositoryPort, validator: PlanValidationPort) -> None:
        self.repository, self.validator = repository, validator

    async def execute(self, id: UUID, correlation_id: UUID) -> PlanningResult:
        result = await GetActionPlanUseCase(self.repository).execute(id)
        plan = self.validator.validate(result.plan, result.scene, result.intent)
        result = replace(
            result,
            plan=plan,
            warnings=tuple(
                f.message for f in plan.validation_results if f.severity in {"warning", "error"}
            ),
            unresolved_ambiguities=tuple(
                f.message for f in plan.validation_results if f.severity == "clarification"
            ),
            validation_summary=f"{plan.status}: {len(plan.validation_results)} finding(s)",
        )
        await self.repository.save(
            result,
            PlanningEvent(
                plan.task_id, correlation_id, "plan_revalidated", plan_id=plan.id, code=plan.status
            ),
        )
        return result


class ListActionPlansUseCase:
    def __init__(self, repository: PlanRepositoryPort) -> None:
        self.repository = repository

    async def execute(self, offset: int = 0, limit: int = 20) -> tuple[list[PlanningResult], int]:
        if offset < 0 or not 1 <= limit <= 100:
            raise ValueError("Invalid pagination")
        return await self.repository.list_plans(offset, limit)
