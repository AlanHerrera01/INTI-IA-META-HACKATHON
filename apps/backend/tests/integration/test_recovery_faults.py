"""Real browser faults; model responses below are explicit test-only fixtures."""

import asyncio
import sys
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest

from inti.application.recovery import RecoveryOrchestrator
from inti.application.sandbox_recipe import SandboxRecipe
from inti.domain.execution import BrowserCheck, BrowserTarget, CheckKind, ExecutableAction
from inti.domain.planning import (
    ActionParameters,
    ModelUsage,
    PlannedActionType,
    RiskLevel,
    Viewport,
)
from inti.domain.recovery import (
    FailureType,
    RecoveryBudget,
    RecoveryDiagnosis,
    RecoveryStatus,
    RecoveryStrategy,
    StrategyType,
)
from inti.infrastructure.persistence.recovery import SQLAlchemyRecoveryRepository

SCRIPTS = str(Path(__file__).resolve().parents[4] / "scripts")
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
from verification_harness import VerificationHarness  # noqa: E402


class RepairFixture:
    """Proposes a known test repair; not a visual performance evaluation."""

    def __init__(self, case):
        self.case, self.calls = case, 0

    async def diagnose(self, context, execution, previous, current, max_tokens):
        self.calls += 1
        original = execution.manifest.actions[execution.session.current_action_index]
        last = replace(original, id=uuid4())
        actions = [last]
        strategy = StrategyType.RELOCATE_TARGET
        failure = FailureType.ELEMENT_MOVED
        if self.case == "rename":
            target = BrowserTarget("button", "Update Record")
            last = replace(
                last,
                target=target,
                preconditions=tuple(
                    replace(c, target=target) if c.target == original.target else c
                    for c in original.preconditions
                ),
            )
            actions = [last]
            failure = FailureType.LABEL_CHANGED
        if self.case == "modal":
            target = BrowserTarget("button", "Dismiss notice")
            modal = BrowserTarget("dialog", "Workspace notice")
            actions = [
                ExecutableAction(
                    uuid4(),
                    "dismiss-test-notice",
                    PlannedActionType.CLICK,
                    target,
                    ActionParameters(),
                    (
                        BrowserCheck(CheckKind.VISIBLE, target),
                        BrowserCheck(CheckKind.VISIBLE, modal),
                    ),
                    (BrowserCheck(CheckKind.NOT_VISIBLE, modal),),
                    RiskLevel.HIGH,
                ),
                last,
            ]
            strategy, failure = StrategyType.DISMISS_AUTHORIZED_MODAL, FailureType.MODAL_OBSTRUCTION
        if self.case == "delay":
            check = BrowserCheck(CheckKind.URL, None, previous.source_url)
            actions = [
                ExecutableAction(
                    uuid4(),
                    "wait-test-render",
                    PlannedActionType.WAIT,
                    None,
                    ActionParameters(seconds=1),
                    (check,),
                    (check,),
                    RiskLevel.LOW,
                ),
                last,
            ]
            strategy, failure = StrategyType.WAIT_FOR_STABLE_STATE, FailureType.TARGET_NOT_FOUND
        return RecoveryDiagnosis(
            failure,
            ("TEST FIXTURE: observed injected presentation",),
            ("TEST FIXTURE: bounded repair hypothesis",),
            "TEST FIXTURE only",
            (),
            (),
            (),
            (previous.id, current.id),
            Viewport(current.width, current.height),
            (
                RecoveryStrategy(
                    strategy,
                    "TEST FIXTURE",
                    tuple(actions),
                    RiskLevel.HIGH,
                    None,
                    "Original postcondition satisfied",
                ),
            ),
            ModelUsage("fixture", "test-only", 10, 10),
        )


@pytest.mark.parametrize(
    "case,fault",
    [
        ("move", {"move_save": True}),
        ("rename", {"save_label": "Update Record"}),
        ("modal", {"modal": True}),
        ("delay", {"render_delay_ms": 1000}),
        ("ambiguous", {"duplicate_save": True}),
    ],
)
async def test_budgeted_recovery_on_real_fault(tmp_path, case, fault):
    h = VerificationHarness(tmp_path)
    reasoner = RepairFixture(case)
    repo = SQLAlchemyRecoveryRepository(h.observations.engine)
    recovery = RecoveryOrchestrator(
        repo,
        h.execution.repository,
        h.execution.plans,
        h.observations,
        h.execution.storage,
        h.manager,
        h.execution.executor,
        h.execution.policy,
        reasoner,
        RecoveryBudget(max_duration_seconds=35),
    )
    h.execution.recovery = recovery
    delegate = h.execution.executor

    class InjectOnce:
        injected = False

        async def execute(self, session_id, action, *args):
            if action.planned_action_id == "save-record" and not self.injected:
                self.injected = True
                await h.configure_faults({"seed": 42, **fault})
                page = h.manager._get(session_id).page
                # The external test controller waits for real UI state to apply.
                await page.wait_for_function(
                    "v => window.document.querySelector('#record-save') && "
                    "(v === 'rename' ? document.querySelector('#record-save').textContent "
                    "=== 'Update Record' : "
                    "v === 'modal' ? !!document.querySelector('#interrupt-dialog') : "
                    "v === 'delay' ? document.querySelector('#record-save').style.visibility "
                    "=== 'hidden' : "
                    "v === 'ambiguous' ? !!document.querySelector('[data-ui-duplicate]') : "
                    "document.querySelector('#record-save').style.left !== '')",
                    arg=case,
                )
            return await delegate.execute(session_id, action, *args)

    h.execution.executor = InjectOnce()
    await h.start()
    try:
        approved = await h.approve(await SandboxRecipe(h.execution, h.demo_url).prepare())
        await h.execution.start(approved.session.id)
        async with asyncio.timeout(45):
            while approved.session.id in h.execution.tasks:
                items, _ = await repo.list_recoveries(0, 20)
                if items and items[0].session.status == RecoveryStatus.AWAITING_APPROVAL:
                    b = items[0]
                    await recovery.approve(
                        b.session.id, b.plan.digest, "plan", (), "fixture-operator"
                    )
                    await recovery.approve(
                        b.session.id,
                        b.plan.digest,
                        "high_risk",
                        tuple(a.id for a in b.plan.actions if a.risk_level == RiskLevel.HIGH),
                        "fixture-operator",
                    )
                await asyncio.sleep(0.03)
        done = await h.execution.get(approved.session.id)
        items, _ = await repo.list_recoveries(0, 20)
        assert len(items) == 1
        b = items[0]
        pc = next(r for r in h.truth() if r["id"] == "PC-104")
        if case == "ambiguous":
            assert done.session.status == "FAILED"
            assert b.session.status == "ESCALATED"
            assert reasoner.calls == 0
            assert pc["status"] == "Inactive" and pc["version"] == 1
        else:
            assert done.session.status == "COMPLETED", (done.session, b.session)
            assert b.session.status == "RECOVERED"
            assert reasoner.calls == 1
            assert pc["status"] == "Operational" and pc["version"] == 2
            assert all(a.completed_at is not None for a in b.attempts)
        assert not done.session.overall_goal_verified
        assert not h.manager.sessions
    finally:
        await h.close()
