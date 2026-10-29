"""Real Chromium + real demo datastore. No model calls or fabricated outcomes."""

import asyncio
import hashlib
import subprocess
import sys
import time
from dataclasses import replace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from playwright.async_api import Error as PlaywrightError

from inti.application.execution import ExecutionOrchestrator
from inti.application.sandbox_recipe import SandboxRecipe
from inti.domain.execution import (
    TERMINAL,
    TRANSITIONS,
    ActionDispatchOutcome,
    AuthorizationStatus,
    BrowserCheck,
    BrowserTarget,
    CheckKind,
    ExecutionError,
    ExecutionLimits,
    ExecutionSession,
    ExecutionStatus,
    GroundingMode,
)
from inti.domain.execution_policy import ExecutionPolicy
from inti.domain.planning import ActionParameters, PlannedActionType, RiskLevel
from inti.domain.planning_policy import PlanningPolicy
from inti.infrastructure.browser.controller import (
    BrowserSessionManager,
    PlaywrightActionExecutor,
    TargetResolver,
)
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.persistence import Base, SQLAlchemyObservationRepository
from inti.infrastructure.persistence.execution import SQLAlchemyExecutionRepository
from inti.infrastructure.persistence.planning import SQLAlchemyPlanRepository
from inti.infrastructure.storage import LocalArtifactStorage
from inti.main import create_app
from inti.presentation.dependencies import Services


@pytest.fixture
def demo_server(tmp_path):
    import socket

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}/"
    process = subprocess.Popen(
        [
            sys.executable,
            "apps/demo-app/server.py",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--db",
            str(tmp_path / "demo.db"),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(100):
            try:
                if httpx.get(url, timeout=1).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.05)
        else:
            raise RuntimeError("Demo server did not start")
        yield url
    finally:
        process.terminate()
        process.wait(timeout=5)


def make_service(tmp_path, url, **limits):
    config = ConfigurationProvider(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'inti.db'}",
        artifact_dir=tmp_path / "artifacts",
        browser_allowed_urls=[url],
        demo_url=url,
        execution_enabled=True,
        execution_operator_token="test-operator-capability-token",
        browser_worker_token="test-private-worker-capability",
    )
    observations = SQLAlchemyObservationRepository(config.database_url.get_secret_value())
    Base.metadata.create_all(observations.engine)
    manager = BrowserSessionManager(config)
    storage = LocalArtifactStorage(config.artifact_dir)
    service = ExecutionOrchestrator(
        SQLAlchemyExecutionRepository(observations.engine),
        SQLAlchemyPlanRepository(observations.engine),
        observations,
        storage,
        manager,
        PlaywrightActionExecutor(manager),
        ExecutionPolicy(PlanningPolicy((url,)), (url,), ExecutionLimits(**limits)),
        AsyncMock(),
    )
    return config, observations, manager, service


async def approve(service, bundle):
    bundle = await service.approve(
        bundle.session.id, bundle.manifest.digest, "plan", (), "test-human"
    )
    assert bundle.session.status == ExecutionStatus.AWAITING_APPROVAL
    high = tuple(a.id for a in bundle.manifest.actions if a.risk_level == RiskLevel.HIGH)
    return await service.approve(
        bundle.session.id, bundle.manifest.digest, "high_risk", high, "test-human"
    )


async def settle(service, id, status=TERMINAL):
    async with asyncio.timeout(40):
        while True:
            bundle = await service.get(id)
            if bundle.session.status in status and (status != TERMINAL or id not in service.tasks):
                return bundle
            await asyncio.sleep(0.03)


@pytest.mark.parametrize("source", list(ExecutionStatus))
def test_all_state_transitions(source):
    state = ExecutionSession(uuid4(), uuid4(), status=source)
    for target in ExecutionStatus:
        if target in TRANSITIONS.get(source, set()):
            assert state.transition(target).status == target
        else:
            with pytest.raises(ExecutionError):
                state.transition(target)


async def test_real_inventory_execution(tmp_path, demo_server):
    config, observations, manager, service = make_service(tmp_path, demo_server)
    await manager.startup()
    try:
        bundle = await SandboxRecipe(service, demo_server).prepare()
        id = bundle.session.id
        with pytest.raises(ExecutionError, match="READY"):
            await service.start(id)
        with pytest.raises(ExecutionError):
            await service.approve(id, "0" * 64, "plan", (), "test-human")
        bundle = await approve(service, bundle)
        assert bundle.session.status == ExecutionStatus.READY
        await service.start(id)
        with pytest.raises(ExecutionError) as duplicate:
            await service.start(id)
        assert duplicate.value.code == "DUPLICATE_START"
        bundle = await settle(service, id)
        assert bundle.session.status == ExecutionStatus.COMPLETED, bundle.session
        assert len(bundle.results) == 9
        assert all(r.action_executed and r.postconditions_satisfied for r in bundle.results)
        assert not bundle.session.overall_goal_verified
        assert bundle.browser_session.status == "CLOSED"
        for result in bundle.results:
            assert result.resolution.method == "accessible_role_or_label"
            for oid in (result.before_observation_id, result.after_observation_id):
                assert (await observations.get(oid)).restricted
                assert (await service.storage.read(oid)).startswith(b"\x89PNG")
        assert all(not item.restricted for item in await observations.latest(100))
        events = await service.repository.events(id, 0)
        assert {
            "execution_created",
            "approval_required",
            "action_started",
            "action_completed",
            "execution_completed",
            "browser_session_closed",
        } <= {e.event_type for e in events}
        assert [e.sequence for e in events] == sorted({e.sequence for e in events})
        assert await service.repository.events(id, events[-1].sequence) == []
        # Independent application API and fresh browser reload, outside the executor.
        async with httpx.AsyncClient() as client:
            data = (await client.get(demo_server + "api/inventory")).json()
        row = next(row for row in data if row["id"] == "PC-104")
        assert row["status"] == "Operational"
        fresh = await manager.open(
            uuid4(), demo_server, bundle.manifest.viewport, bundle.manifest.limits
        )
        page = manager._get(fresh.id).page
        assert (
            await page.get_by_label("PC-104 table status", exact=True).input_value()
            == "Operational"
        )
        assert (await service.repository.list_executions(0, 20))[1] == 1
        with pytest.raises(ExecutionError):
            await service.repository.commit(bundle, -1, ())
    finally:
        await service.shutdown()
        await manager.shutdown()
        observations.engine.dispose()


async def test_pause_resume_cancel_and_freshness(tmp_path, demo_server):
    _, observations, manager, service = make_service(tmp_path, demo_server)
    await manager.startup()
    try:
        bundle = await approve(service, await SandboxRecipe(service, demo_server).prepare())
        id = bundle.session.id
        await service.start(id)
        await service.pause(id)
        paused = await settle(service, id, {ExecutionStatus.PAUSED})
        index = paused.session.current_action_index
        await asyncio.sleep(0.15)
        assert (await service.get(id)).session.current_action_index == index
        await service.resume(id)
        start = time.monotonic()
        result = await service.cancel(id)
        assert time.monotonic() - start < 5
        assert result.session.status == ExecutionStatus.CANCELLED
        assert not manager.sessions
        assert (await service.cancel(id)).session.status == ExecutionStatus.CANCELLED
        assert {"execution_paused", "execution_resumed", "execution_cancelled"} <= {
            e.event_type for e in await service.repository.events(id, 0)
        }
        with pytest.raises(ExecutionError):
            await service.resume(id)
        bundle = await SandboxRecipe(service, demo_server).prepare()
        service.policy.freshness_seconds = -1
        with pytest.raises(ExecutionError) as stale:
            await service.approve(
                bundle.session.id, bundle.manifest.digest, "plan", (), "test-human"
            )
        assert stale.value.code == "PLAN_EXPIRED"
    finally:
        await service.shutdown()
        await manager.shutdown()
        observations.engine.dispose()


async def test_resolution_and_network_boundaries(tmp_path, demo_server):
    _, observations, manager, service = make_service(tmp_path, demo_server)
    await manager.startup()
    try:
        bundle = await SandboxRecipe(service, demo_server).prepare()
        browser = await manager.open(
            uuid4(), demo_server, bundle.manifest.viewport, bundle.manifest.limits
        )
        page = manager._get(browser.id).page
        obs, png = await manager.observe(browser.id)
        digest = hashlib.sha256(png).hexdigest()
        resolver = TargetResolver()
        with pytest.raises(ExecutionError) as unresolved:
            await resolver.resolve(
                page, BrowserTarget("button", "Missing"), GroundingMode.HYBRID_DOM, obs, digest
            )
        assert unresolved.value.code == "TARGET_UNRESOLVED"
        await page.set_content(
            "<button>Duplicate</button><button>Duplicate</button><button disabled>Disabled</button>"
        )
        for name, code in [("Duplicate", "TARGET_AMBIGUOUS"), ("Disabled", "TARGET_DISABLED")]:
            with pytest.raises(ExecutionError) as error:
                await resolver.resolve(
                    page, BrowserTarget("button", name), GroundingMode.HYBRID_DOM, obs, digest
                )
            assert error.value.code == code
        with pytest.raises(ExecutionError):
            await manager.open(
                uuid4(), "http://169.254.169.254/", bundle.manifest.viewport, bundle.manifest.limits
            )
        with pytest.raises(PlaywrightError):
            await page.goto("https://example.com/", timeout=2000)
        await manager.close(browser.id)
        browser = await manager.open(
            uuid4(), demo_server, bundle.manifest.viewport, bundle.manifest.limits
        )
        page = manager._get(browser.id).page
        # Every request is routed, including subresources and frames.
        await page.set_content(
            '<img src="http://169.254.169.254/latest/meta-data"><iframe src="http://127.0.0.1:1/"></iframe>'
        )
        await asyncio.sleep(0.1)
        assert all(
            frame.url in {"", "about:blank", "chrome-error://chromewebdata/"}
            for frame in page.frames[1:]
        )
    finally:
        await manager.shutdown()
        observations.engine.dispose()


@pytest.mark.parametrize(
    "fault,expected",
    [
        ("timeout", ExecutionStatus.TIMED_OUT),
        ("postcondition", ExecutionStatus.FAILED),
        ("dependency", ExecutionStatus.FAILED),
    ],
)
async def test_execution_stops_without_retry(tmp_path, demo_server, fault, expected):
    _, observations, manager, service = make_service(
        tmp_path, demo_server, max_duration_seconds=3 if fault == "timeout" else 180
    )
    await manager.startup()
    try:
        bundle = await approve(service, await SandboxRecipe(service, demo_server).prepare())
        executor = AsyncMock()
        if fault == "timeout":

            async def slow(*args):
                await asyncio.sleep(60)

            executor.execute.side_effect = slow
        elif fault == "postcondition":
            executor.execute.return_value = ActionDispatchOutcome(
                None, True, False, "POSTCONDITION_FAILED", "Receipt absent"
            )
        else:
            executor.execute.side_effect = RuntimeError(
                "Internal dependency detail must not be returned"
            )
        service.executor = executor
        await service.start(bundle.session.id)
        result = await settle(service, bundle.session.id)
        assert result.session.status == expected
        assert executor.execute.await_count <= 1
        assert not manager.sessions
        if fault == "postcondition":
            assert result.results[0].action_executed
            assert result.results[0].postconditions_satisfied is False
            assert result.results[0].after_observation_id
        if fault == "dependency":
            assert "Internal dependency" not in result.session.error_summary
            assert result.results[0].may_have_executed
    finally:
        await service.shutdown()
        await manager.shutdown()
        observations.engine.dispose()


async def test_lost_session_and_restart_fail_closed(tmp_path, demo_server):
    _, observations, manager, service = make_service(tmp_path, demo_server)
    await manager.startup()
    try:
        bundle = await approve(service, await SandboxRecipe(service, demo_server).prepare())
        id = bundle.session.id
        await service.start(id)
        await service.pause(id)
        bundle = await settle(service, id, {ExecutionStatus.PAUSED})
        await manager.close(bundle.session.browser_session_id)
        with pytest.raises(ExecutionError):
            await service.resume(id)
        bundle = await settle(service, id)
        assert bundle.session.status == ExecutionStatus.FAILED
        assert bundle.session.error_code == "SESSION_LOST"
        fresh = await approve(service, await SandboxRecipe(service, demo_server).prepare())
        # Persist a running record without a scheduler, as after a process crash.
        running = replace(fresh, session=fresh.session.transition(ExecutionStatus.RUNNING))
        await service.repository.commit(running, fresh.session.version, ())
        await service.recover()
        assert (await service.get(running.session.id)).session.error_code == "PROCESS_RESTART"
    finally:
        await service.shutdown()
        await manager.shutdown()
        observations.engine.dispose()


async def test_typed_page_actions_and_stale_observation(tmp_path, demo_server):
    _, observations, manager, service = make_service(tmp_path, demo_server)
    await manager.startup()
    try:
        bundle = await SandboxRecipe(service, demo_server).prepare()
        browser = await manager.open(
            uuid4(), demo_server, bundle.manifest.viewport, bundle.manifest.limits
        )
        check = BrowserCheck(CheckKind.URL, None, demo_server)
        base = replace(
            bundle.manifest.actions[0],
            action_type=PlannedActionType.WAIT,
            parameters=ActionParameters(seconds=0.01),
            target=None,
            authorization_status=AuthorizationStatus.APPROVED,
            preconditions=(check,),
            expected_postconditions=(check,),
        )
        for kind, parameters in [
            (PlannedActionType.WAIT, ActionParameters(seconds=0.01)),
            (PlannedActionType.SCROLL, ActionParameters(direction="down", amount=50)),
            (PlannedActionType.NAVIGATE, ActionParameters(url=demo_server)),
        ]:
            obs, png = await manager.observe(browser.id)
            outcome = await service.executor.execute(
                browser.id,
                replace(base, action_type=kind, parameters=parameters),
                GroundingMode.HYBRID_DOM,
                obs,
                hashlib.sha256(png).hexdigest(),
            )
            assert outcome.error_code is None, outcome
            assert outcome.postconditions_satisfied
        obs, png = await manager.observe(browser.id)
        await manager.observe(browser.id)
        outcome = await service.executor.execute(
            browser.id, base, GroundingMode.HYBRID_DOM, obs, hashlib.sha256(png).hexdigest()
        )
        assert outcome.error_code == "OBSERVATION_STALE"
        assert not outcome.action_executed
    finally:
        await manager.shutdown()
        observations.engine.dispose()


async def test_all_request_firewall_without_application_csp(tmp_path):
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    reached = []
    visited = []
    redirect = [False]

    class Trap(BaseHTTPRequestHandler):
        def do_GET(self):
            reached.append(self.path)
            self.send_response(200)
            self.end_headers()

        def log_message(self, *args):
            pass

    trap = ThreadingHTTPServer(("127.0.0.1", 0), Trap)
    forbidden = f"http://127.0.0.1:{trap.server_port}/forbidden"

    class PageHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            visited.append(self.path)
            if redirect[0]:
                self.send_response(302)
                self.send_header("Location", forbidden)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(
                (
                    f'<h1>Authorized test sandbox</h1><img src="{forbidden}">'
                    f'<iframe src="{forbidden}"></iframe><iframe src="/forbidden-frame"></iframe>'
                    f'<script>fetch("{forbidden}").catch(()=>{{}});'
                    f'window.open("{forbidden}"); '
                    f'new WebSocket("{forbidden.replace("http:", "ws:")}");</script>'
                ).encode()
            )

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), PageHandler)
    for item in (server, trap):
        threading.Thread(target=item.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/"
    _, observations, manager, _ = make_service(tmp_path, url)
    await manager.startup()
    try:
        from inti.domain.planning import Viewport

        session = await manager.open(uuid4(), url, Viewport(1440, 900), ExecutionLimits())
        await asyncio.sleep(0.15)
        assert reached == []
        assert visited == ["/"]
        assert len(manager._get(session.id).context.pages) == 1
        await manager.close(session.id)
        redirect[0] = True
        with pytest.raises(PlaywrightError):
            await manager.open(uuid4(), url, Viewport(1440, 900), ExecutionLimits())
        assert reached == []
        assert visited == ["/", "/"]
        assert not manager.sessions
    finally:
        await manager.shutdown()
        observations.engine.dispose()
        for item in (server, trap):
            item.shutdown()
            item.server_close()


def test_protected_api_and_websocket(tmp_path, demo_server):
    config, observations, manager, service = make_service(tmp_path, demo_server)
    services = Services(
        config, observations, service.storage, AsyncMock(), AsyncMock(), execution=service
    )
    headers = {"Authorization": "Bearer " + config.execution_operator_token.get_secret_value()}
    with TestClient(create_app(services)) as client:
        client.portal.call(manager.startup)
        try:
            assert client.get("/api/v1/executions").status_code == 401
            assert client.post("/api/v1/executions/demo/prepare").status_code == 401
            response = client.post("/api/v1/executions/demo/prepare", headers=headers)
            assert response.status_code == 201, response.text
            bundle = response.json()
            oid = bundle["manifest"]["plan_snapshot"]["scene"]["observation_id"]
            assert client.get(f"/api/v1/observations/{oid}/screenshot").status_code == 401
            assert (
                client.get(f"/api/v1/observations/{oid}/screenshot", headers=headers).status_code
                == 200
            )
            creation = {
                "plan_id": bundle["session"]["plan_id"],
                "grounding_mode": "hybrid_dom",
                "contracts": [
                    {
                        "planned_action_id": a["planned_action_id"],
                        "target": a["target"],
                        "preconditions": a["preconditions"],
                        "postconditions": a["expected_postconditions"],
                    }
                    for a in bundle["manifest"]["actions"]
                ],
            }
            created = client.post("/api/v1/executions", json=creation, headers=headers)
            assert created.status_code == 201, created.text
            extra_id = created.json()["session"]["id"]
            assert (
                client.post(f"/api/v1/executions/{extra_id}/cancel", headers=headers).status_code
                == 200
            )
            id = bundle["session"]["id"]
            base = f"/api/v1/executions/{id}"
            assert client.get(base, headers=headers).status_code == 200
            assert client.get(base + "/actions", headers=headers).json() == []
            with client.websocket_connect(f"/ws/executions/{id}") as ws:
                ws.send_json(
                    {"token": config.execution_operator_token.get_secret_value(), "after": 0}
                )
                event = ws.receive_json()
                assert event["event_type"] == "execution_created"
            payload = {"manifest_digest": bundle["manifest"]["digest"], "scope": "plan"}
            assert client.post(base + "/approve", json=payload, headers=headers).status_code == 200
            high = [a["id"] for a in bundle["manifest"]["actions"] if a["risk_level"] == "HIGH"]
            payload.update(scope="high_risk", action_ids=high)
            assert (
                client.post(base + "/approve", json=payload, headers=headers).json()["session"][
                    "status"
                ]
                == "READY"
            )
            assert client.post(base + "/start", headers=headers).status_code == 202
            assert client.post(base + "/pause", headers=headers).status_code == 200
            for _ in range(100):
                if client.get(base, headers=headers).json()["session"]["status"] == "PAUSED":
                    break
                time.sleep(0.05)
            assert client.post(base + "/resume", headers=headers).status_code == 200
            assert (
                client.post(base + "/cancel", headers=headers).json()["session"]["status"]
                == "CANCELLED"
            )
            events = client.get(base + "/events", headers=headers).json()
            assert events
            assert client.get("/api/v1/executions", headers=headers).json()["total"] == 2
        finally:
            client.portal.call(manager.shutdown)
    observations.engine.dispose()


def test_private_worker_rpc(tmp_path, demo_server):
    from inti.worker import create_worker

    config, observations, _, _ = make_service(tmp_path, demo_server)
    headers = {"Authorization": "Bearer " + config.browser_worker_token.get_secret_value()}
    with TestClient(create_worker(config)) as client:
        assert client.get("/health").json() == {"ready": True, "configured": True}
        payload = {
            "execution_id": str(uuid4()),
            "url": demo_server,
            "viewport": {"width": 1440, "height": 900},
            "limits": {
                "max_actions": 30,
                "max_duration_seconds": 180,
                "action_timeout_seconds": 10,
                "max_navigation_count": 3,
            },
        }
        assert client.post("/sessions", json=payload).status_code == 409
        opened = client.post("/sessions", json=payload, headers=headers)
        assert opened.status_code == 200, opened.text
        id = opened.json()["id"]
        assert client.get(f"/sessions/{id}", headers=headers).json()["status"] == "OPEN"
        assert (
            client.post(f"/sessions/{id}/observe", headers=headers)
            .json()["png_base64"]
            .startswith("iVBOR")
        )
        assert (
            client.delete(f"/executions/{payload['execution_id']}", headers=headers).status_code
            == 204
        )
        assert client.get(f"/sessions/{id}", headers=headers).status_code == 409
        assert (
            client.post("/sessions", json=payload, headers=headers).json()["error"]["code"]
            == "SESSION_REVOKED"
        )
        payload["execution_id"] = str(uuid4())
        payload["limits"]["max_actions"] = 50
        assert (
            client.post("/sessions", json=payload, headers=headers).json()["error"]["code"]
            == "LIMIT_DENIED"
        )
    observations.engine.dispose()
