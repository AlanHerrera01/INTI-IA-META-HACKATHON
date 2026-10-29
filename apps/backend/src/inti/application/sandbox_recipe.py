"""Explicit authored sandbox workflow, never represented as a Meta response."""

from datetime import UTC, datetime
from uuid import uuid4

from inti.application.execution import ExecutionOrchestrator
from inti.domain.execution import (
    ActionContract,
    BrowserCheck,
    BrowserTarget,
    CheckKind,
    ExecutionBundle,
    GroundingMode,
    TargetQuery,
)
from inti.domain.planning import (
    ActionParameters,
    ActionPlan,
    ActionTarget,
    GroundingSource,
    PlannedAction,
    PlannedActionType,
    PlanningEvent,
    PlanningResult,
    RiskLevel,
    TaskIntent,
    Viewport,
    VisualScene,
)


class SandboxRecipe:
    def __init__(self, executions: ExecutionOrchestrator, url: str) -> None:
        self.executions, self.url = executions, url

    async def prepare(self) -> ExecutionBundle:
        service = self.executions
        preparation_id = uuid4()
        started = datetime.now(UTC)
        search = BrowserTarget("textbox", "Search equipment")
        open_record = BrowserTarget("button", "Open PC-104")
        status = BrowserTarget("combobox", "PC-104 status")
        save = BrowserTarget("button", "Save PC-104")
        notice = BrowserTarget("text", "Saved PC-104: Operational")
        browser = await service.browser.open(
            preparation_id, self.url, Viewport(1440, 900), service.policy.limits
        )
        try:
            elements = await service.browser.catalog(
                browser.id,
                (
                    TargetQuery("search", search),
                    TargetQuery("open-pc104", open_record),
                    TargetQuery("inventory", BrowserTarget("table", "Equipment inventory")),
                ),
            )
            observation, data = await service.browser.observe(browser.id)
            await service.storage.write(observation.id, data)
            await service.observations.save(observation)
        finally:
            await service.browser.close_execution(preparation_id)
        scene = VisualScene(
            observation.id,
            Viewport(1440, 900),
            elements,
            "Authored PC-104 sandbox recipe; targets inspected through accessible DOM. "
            "No Meta interpretation.",
            (),
            captured_at=observation.timestamp,
        )
        actions: list[PlannedAction] = []
        contracts = []

        def add(
            id: str,
            kind: PlannedActionType,
            target: BrowserTarget,
            element: str | None,
            params: ActionParameters,
            checks: list[BrowserCheck],
            risk: RiskLevel = RiskLevel.LOW,
        ) -> None:
            action_target = (
                ActionTarget(element, target.name, GroundingSource.DOM_ASSISTED, len(actions) > 1)
                if element
                else ActionTarget(None, target.name, GroundingSource.UNRESOLVED, True)
            )
            actions.append(
                PlannedAction(
                    id,
                    kind,
                    action_target,
                    params,
                    ("Authorized inventory is visible; freshly resolve the declared target",),
                    ("The approved typed immediate outcome checks must pass",),
                    "Authored sandbox recipe step; runtime evidence is required",
                    risk,
                )
            )
            before = [BrowserCheck(CheckKind.VISIBLE, target)]
            if kind in {
                PlannedActionType.CLICK,
                PlannedActionType.TYPE_TEXT,
                PlannedActionType.SELECT_OPTION,
            }:
                before.append(BrowserCheck(CheckKind.ENABLED, target))
            if kind == PlannedActionType.SELECT_OPTION:
                before.append(BrowserCheck(CheckKind.SELECTED_OPTION, target, "Inactive"))
            contracts.append(ActionContract(id, target, tuple(before), tuple(checks)))

        add(
            "inspect-search",
            PlannedActionType.INSPECT,
            search,
            "search",
            ActionParameters(evidence="Search equipment is visible"),
            [BrowserCheck(CheckKind.VISIBLE, search)],
        )
        add(
            "search-pc104",
            PlannedActionType.TYPE_TEXT,
            search,
            "search",
            ActionParameters(text="PC-104"),
            [
                BrowserCheck(CheckKind.INPUT_VALUE, search, "PC-104"),
                BrowserCheck(CheckKind.VISIBLE, open_record),
            ],
            RiskLevel.MEDIUM,
        )
        add(
            "inspect-result",
            PlannedActionType.INSPECT,
            open_record,
            "open-pc104",
            ActionParameters(evidence="Exactly one Open PC-104 control is visible"),
            [BrowserCheck(CheckKind.VISIBLE, open_record)],
        )
        add(
            "open-record",
            PlannedActionType.CLICK,
            open_record,
            "open-pc104",
            ActionParameters(),
            [
                BrowserCheck(CheckKind.VISIBLE, status),
                BrowserCheck(CheckKind.SELECTED_OPTION, status, "Inactive"),
            ],
            RiskLevel.MEDIUM,
        )
        add(
            "inspect-status",
            PlannedActionType.INSPECT,
            status,
            None,
            ActionParameters(evidence="PC-104 status selector is visible"),
            [BrowserCheck(CheckKind.VISIBLE, status)],
        )
        add(
            "select-operational",
            PlannedActionType.SELECT_OPTION,
            status,
            None,
            ActionParameters(option="Operational"),
            [BrowserCheck(CheckKind.SELECTED_OPTION, status, "Operational")],
            RiskLevel.MEDIUM,
        )
        add(
            "inspect-save",
            PlannedActionType.INSPECT,
            save,
            None,
            ActionParameters(evidence="Save PC-104 is visible"),
            [BrowserCheck(CheckKind.VISIBLE, save)],
        )
        add(
            "save-record",
            PlannedActionType.CLICK,
            save,
            None,
            ActionParameters(),
            [BrowserCheck(CheckKind.VISIBLE, notice)],
            RiskLevel.HIGH,
        )
        add(
            "inspect-save-receipt",
            PlannedActionType.VERIFY,
            notice,
            None,
            ActionParameters(evidence="Saved PC-104: Operational receipt is visibly displayed"),
            [BrowserCheck(CheckKind.TEXT, notice, "Saved PC-104: Operational")],
        )
        goal = "Find asset PC-104 and change its status to Operational."
        intent = TaskIntent(
            goal,
            "INTI synthetic inventory sandbox",
            (),
            "PC-104 status is saved as Operational",
            (),
            (goal,),
        )
        plan = service.policy.planning.validate(
            ActionPlan(uuid4(), observation.id, goal, tuple(actions)), scene, intent
        )
        result = PlanningResult(
            plan,
            scene,
            intent,
            (),
            (),
            (),
            (),
            "Authored recipe validated with deferred runtime observation gates; no model inference",
            started,
            datetime.now(UTC),
            uuid4(),
        )
        await service.plans.save(
            result,
            PlanningEvent(
                plan.task_id, result.correlation_id, "sandbox_recipe_authored", plan_id=plan.id
            ),
        )
        return await service.create(plan.id, tuple(contracts), self.url, GroundingMode.HYBRID_DOM)
