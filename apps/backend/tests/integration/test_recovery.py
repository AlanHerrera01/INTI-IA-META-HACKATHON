"""Actual Chromium/store with explicitly mocked reasoning; no runtime fallback."""

import asyncio
from dataclasses import replace
from uuid import uuid4

import httpx
import pytest
from test_execution import approve, make_service, settle
from test_execution import demo_server as demo_server

from inti.application.recovery import RecoveryOrchestrator
from inti.application.sandbox_recipe import SandboxRecipe
from inti.domain.execution import BrowserTarget, ExecutionError, ExecutionStatus
from inti.domain.planning import ModelUsage, RiskLevel, Viewport
from inti.domain.recovery import (
    FailureType,
    RecoveryBudget,
    RecoveryDiagnosis,
    RecoveryStatus,
    RecoveryStrategy,
    StrategyType,
)
from inti.infrastructure.browser import PlaywrightBrowserAdapter
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.infrastructure.persistence import Base
from inti.infrastructure.persistence.recovery import SQLAlchemyRecoveryRepository
from inti.main import create_app
from inti.presentation.dependencies import Services


class LabelChangeReasonerFixture:
    """Known test response, never installed into application composition."""

    calls = 0

    async def diagnose(self, context, execution, previous, current, max_tokens):
        self.calls += 1
        original = execution.manifest.actions[execution.session.current_action_index]
        target = BrowserTarget("button", "Update Record")
        step = replace(
            original,
            id=uuid4(),
            target=target,
            preconditions=tuple(
                replace(c, target=target) if c.target == original.target else c
                for c in original.preconditions
            ),
        )
        strategy = RecoveryStrategy(
            StrategyType.RELOCATE_TARGET,
            "TEST FIXTURE: visible label changed; operator must confirm",
            (step,),
            RiskLevel.HIGH,
            None,
            "Original approved save receipt is visible",
        )
        return RecoveryDiagnosis(
            FailureType.LABEL_CHANGED,
            ("TEST FIXTURE: Update Record is visible",),
            ("It may be the renamed save control",),
            "TEST FIXTURE: label changed",
            (),
            (target,),
            (),
            (previous.id, current.id),
            Viewport(current.width, current.height),
            (strategy,),
            ModelUsage("test-only-recovery", "fixture", 10, 10),
        )


async def test_label_change_recovery_vertical_slice(tmp_path, demo_server):
    config, observations, manager, execution = make_service(tmp_path, demo_server)
    Base.metadata.create_all(observations.engine)
    reasoner = LabelChangeReasonerFixture()
    repository = SQLAlchemyRecoveryRepository(observations.engine)
    recovery = RecoveryOrchestrator(
        repository,
        execution.repository,
        execution.plans,
        observations,
        execution.storage,
        manager,
        execution.executor,
        execution.policy,
        reasoner,
        RecoveryBudget(max_duration_seconds=30),
    )
    execution.recovery = recovery
    original_executor = execution.executor

    class InjectOnce:
        injected = False

        async def execute(self, session_id, action, *args):
            if action.planned_action_id == "save-record" and not self.injected:
                self.injected = True
                await (
                    manager._get(session_id)
                    .page.get_by_role("button", name="Save PC-104", exact=True)
                    .evaluate("node => {node.textContent = 'Update Record';}")
                )
            return await original_executor.execute(session_id, action, *args)

    execution.executor = InjectOnce()
    await manager.startup()
    try:
        bundle = await approve(execution, await SandboxRecipe(execution, demo_server).prepare())
        await execution.start(bundle.session.id)
        async with asyncio.timeout(40):
            while True:
                items, _ = await repository.list_recoveries(0, 20)
                if items and items[0].session.status == RecoveryStatus.AWAITING_APPROVAL:
                    repaired = items[0]
                    break
                if (
                    await execution.get(bundle.session.id)
                ).session.status == ExecutionStatus.FAILED:
                    raise AssertionError((await execution.get(bundle.session.id)).session)
                await asyncio.sleep(0.03)
        assert (await execution.get(bundle.session.id)).session.status == ExecutionStatus.RECOVERING
        assert repaired.plan.decision.requires_approval
        with pytest.raises(ExecutionError):
            await recovery.approve(repaired.session.id, "0" * 64, "plan", (), "test-operator")
        with pytest.raises(ExecutionError):
            await recovery.approve(
                repaired.session.id,
                repaired.plan.digest,
                "high_risk",
                tuple(a.id for a in repaired.plan.actions),
                "test-operator",
            )
        await recovery.approve(
            repaired.session.id, repaired.plan.digest, "plan", (), "test-operator"
        )
        await recovery.approve(
            repaired.session.id,
            repaired.plan.digest,
            "high_risk",
            tuple(a.id for a in repaired.plan.actions if a.risk_level == RiskLevel.HIGH),
            "test-operator",
        )
        done = await settle(execution, bundle.session.id)
        assert done.session.status == ExecutionStatus.COMPLETED, done.session
        repaired = await recovery.get(repaired.session.id)
        assert repaired.session.status == RecoveryStatus.RECOVERED, repaired
        assert repaired.session.attempts_count == 1
        assert reasoner.calls == 1
        assert len(repaired.results) == 1 and repaired.results[0].action_executed
        assert any(r.status == "SATISFIED" for r in done.results)
        assert not done.session.overall_goal_verified
        async with httpx.AsyncClient() as client:
            rows = (await client.get(demo_server + "api/inventory")).json()
        asset = next(row for row in rows if row["id"] == "PC-104")
        assert asset["status"] == "Operational" and asset["version"] == 2
        events = await execution.repository.events(done.session.id)
        assert {
            "failure_detected",
            "diagnosis_completed",
            "recovery_plan_generated",
            "recovery_approval_required",
            "recovery_action_completed",
            "recovery_succeeded",
            "execution_resumed",
        } <= {e.event_type for e in events}
        assert all(
            [(await observations.get(id)).restricted for id in repaired.session.evidence_ids]
        )
        config.recovery_enabled = True
        services = Services(
            config,
            observations,
            execution.storage,
            PlaywrightBrowserAdapter(config, execution.storage),
            MetaModelAPIAdapter(config, execution.storage),
            execution=execution,
            recovery=recovery,
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=create_app(services)), base_url="http://test"
        ) as api:
            base = "/api/v1/recoveries/" + str(repaired.session.id)
            headers = {
                "Authorization": "Bearer " + config.execution_operator_token.get_secret_value()
            }
            assert (await api.get(base)).status_code == 401
            assert (await api.get("/api/v1/recoveries", headers=headers)).json()["total"] == 1
            assert (await api.get(base, headers=headers)).json()["session"]["status"] == "RECOVERED"
            assert len((await api.get(base + "/attempts", headers=headers)).json()) == 1
            assert (await api.get(base + "/events", headers=headers)).json()
            assert (await api.post(base + "/retry", headers=headers)).status_code == 409
            assert (await api.post(base + "/cancel", headers=headers)).json()["session"][
                "status"
            ] == "RECOVERED"
    finally:
        await execution.shutdown()
        await manager.shutdown()
        observations.engine.dispose()
