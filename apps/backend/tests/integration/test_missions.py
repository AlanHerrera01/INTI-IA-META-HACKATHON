"""Real Chromium, APIs, reset and store; fixture reasoning is isolated in its own test."""

import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from pydantic import SecretStr

from inti.application.missions import MissionService
from inti.application.recovery import RecoveryOrchestrator
from inti.application.use_cases import CaptureObservationUseCase
from inti.domain.recovery import RecoveryBudget
from inti.infrastructure.browser import PlaywrightBrowserAdapter
from inti.infrastructure.demo_control import LocalDemoControl
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.infrastructure.persistence import Base
from inti.infrastructure.persistence.missions import SQLAlchemyMissionRepository
from inti.infrastructure.persistence.recovery import SQLAlchemyRecoveryRepository
from inti.main import create_app
from inti.presentation.dependencies import Services

SCRIPTS = str(Path(__file__).resolve().parents[4] / "scripts")
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
from verification_harness import FAULT_TOKEN, OPERATOR_TOKEN, VerificationHarness  # noqa: E402

GOAL = "Find asset PC-104, change its status to Operational, and verify the persisted result."
HEADERS = {"Authorization": "Bearer " + OPERATOR_TOKEN}


def stack(tmp_path, fixture_recovery=False):
    h = VerificationHarness(tmp_path)
    h.config.demo_controls_enabled = True
    h.config.recovery_enabled = fixture_recovery
    h.config.mission_model_calls_enabled = fixture_recovery
    h.config.demo_control_url = h.admin_url
    h.config.demo_control_token = SecretStr(FAULT_TOKEN)
    h.config.benchmark_report_dir = Path(__file__).resolve().parents[4] / "benchmarks" / "reports"
    browser = PlaywrightBrowserAdapter(h.config, h.execution.storage)
    model = MetaModelAPIAdapter(h.config, h.execution.storage)
    recovery = None
    fixture = None
    if fixture_recovery:
        from test_recovery_faults import RepairFixture

        fixture = RepairFixture("rename")
        model = AsyncMock()
        model.status.return_value = {"configured": True, "available": True}
        recovery = RecoveryOrchestrator(
            SQLAlchemyRecoveryRepository(h.observations.engine),
            h.execution.repository,
            h.execution.plans,
            h.observations,
            h.execution.storage,
            h.manager,
            h.execution.executor,
            h.execution.policy,
            fixture,
            RecoveryBudget(max_duration_seconds=40),
        )
        h.execution.recovery = recovery
    repo = SQLAlchemyMissionRepository(h.observations.engine)
    Base.metadata.create_all(h.observations.engine)
    missions = MissionService(
        repo,
        h.execution,
        CaptureObservationUseCase(browser, h.observations, h.execution.storage),
        None,
        model,
        LocalDemoControl(h.config),
        h.demo_url,
        model_calls_enabled=fixture_recovery,
        verification_repository=h.repository,
    )
    h.execution.verification = h.verifier
    h.execution.demo_controller = missions
    services = Services(
        h.config,
        h.observations,
        h.execution.storage,
        browser,
        model,
        execution=h.execution,
        verification=h.verifier,
        recovery=recovery,
        missions=missions,
    )
    return h, services, fixture


def prepare(client):
    created = client.post(
        "/api/v1/missions", headers=HEADERS, json={"objective": GOAL, "mode": "authored_demo"}
    )
    assert created.status_code == 201, created.text
    mission = created.json()
    planned = client.post(f"/api/v1/missions/{mission['id']}/prepare", headers=HEADERS)
    assert planned.status_code == 200, planned.text
    mission = planned.json()
    detail = client.get(f"/api/v1/missions/{mission['id']}", headers=HEADERS).json()
    assert detail["plan"]["plan"]["task_id"] == mission["id"]
    assert detail["execution"]["session"]["task_id"] == mission["id"]
    assert detail["plan"]["plan"]["goal"] == GOAL
    return mission, detail["execution"]


def approve_start(client, execution):
    base = "/api/v1/executions/" + execution["session"]["id"]
    assert client.post(base + "/start", headers=HEADERS).status_code == 409
    assert (
        client.post(
            base + "/approve",
            headers=HEADERS,
            json={"manifest_digest": execution["manifest"]["digest"], "scope": "plan"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            base + "/approve",
            headers=HEADERS,
            json={
                "manifest_digest": execution["manifest"]["digest"],
                "scope": "high_risk",
                "action_ids": [
                    a["id"] for a in execution["manifest"]["actions"] if a["risk_level"] == "HIGH"
                ],
            },
        ).status_code
        == 200
    )
    assert client.post(base + "/start", headers=HEADERS).status_code == 202


def settle(client, id, approve_recovery=False):
    for _ in range(1500):
        response = client.get("/api/v1/missions/" + id, headers=HEADERS)
        assert response.status_code == 200, response.text
        d = response.json()
        for r in d["recoveries"]:
            if approve_recovery and r["session"]["status"] == "AWAITING_APPROVAL":
                base = "/api/v1/recoveries/" + r["session"]["id"] + "/approve"
                assert (
                    client.post(
                        base,
                        headers=HEADERS,
                        json={"manifest_digest": r["plan"]["digest"], "scope": "plan"},
                    ).status_code
                    == 200
                )
                assert (
                    client.post(
                        base,
                        headers=HEADERS,
                        json={
                            "manifest_digest": r["plan"]["digest"],
                            "scope": "high_risk",
                            "action_ids": [
                                a["id"] for a in r["plan"]["actions"] if a["risk_level"] == "HIGH"
                            ],
                        },
                    ).status_code
                    == 200
                )
        if d["verification_report"] and d["verification_report"]["effective_verdict"]:
            return d
        if d["execution"]["session"]["status"] in {"FAILED", "CANCELLED", "TIMED_OUT"}:
            raise AssertionError(d["execution"]["session"])
        time.sleep(0.03)
    raise AssertionError("Mission did not reach independent verification")


def test_repeated_real_authored_demo_identity_reset_and_history(tmp_path):
    h, services, _ = stack(tmp_path)
    with TestClient(create_app(services)) as client:
        client.portal.call(h.start)
        try:
            assert client.get("/api/v1/missions").status_code == 401
            assert client.post("/api/v1/demo/reset", json={}).status_code == 401
            state = client.get("/api/v1/demo/status", headers=HEADERS).json()
            assert state["synthetic"] is True
            assert (
                client.post(
                    "/api/v1/demo/reset",
                    headers=HEADERS,
                    json={"store_id": str(uuid4()), "confirmation": "RESET PC-104"},
                ).status_code
                == 409
            )
            original_unrelated = [r for r in h.truth() if r["id"] != "PC-104"]
            verifications = []
            for _ in range(2):
                reset = client.post(
                    "/api/v1/demo/reset",
                    headers=HEADERS,
                    json={"store_id": state["store_id"], "confirmation": "RESET PC-104"},
                )
                assert reset.status_code == 200, reset.text
                baseline = reset.json()["asset"]
                assert baseline["status"] == "Inactive" and not reset.json()["faults_active"]
                m, e = prepare(client)
                assert (
                    client.post(f"/api/v1/missions/{m['id']}/prepare", headers=HEADERS).json()[
                        "execution_id"
                    ]
                    == e["session"]["id"]
                )
                blocked = client.post(f"/api/v1/missions/{m['id']}/demo-fault", headers=HEADERS)
                assert (
                    blocked.status_code == 409
                    and blocked.json()["error"]["code"] == "LIVE_RECOVERY_BLOCKED"
                )
                approve_start(client, e)
                assert (
                    client.post(
                        "/api/v1/demo/reset",
                        headers=HEADERS,
                        json={"store_id": state["store_id"], "confirmation": "RESET PC-104"},
                    ).status_code
                    == 409
                )
                done = settle(client, m["id"])
                assert done["verification_report"]["effective_verdict"] == "VERIFIED_SUCCESS"
                assert len(done["verifications"][0]["evidence"]) == 8
                assert all(
                    c["status"] == "PASS"
                    for c in done["verifications"][0]["session"]["criteria_results"]
                )
                current = next(r for r in h.truth() if r["id"] == "PC-104")
                assert (
                    current["status"] == "Operational"
                    and current["version"] == baseline["version"] + 1
                )
                verifications.append(done["verifications"][0]["session"]["id"])
            for id in verifications:
                assert (
                    client.get(f"/api/v1/verifications/{id}/report", headers=HEADERS).json()[
                        "effective_verdict"
                    ]
                    == "VERIFIED_SUCCESS"
                )
            assert [r for r in h.truth() if r["id"] != "PC-104"] == original_unrelated
            assert (
                client.get("/api/v1/mission-control", headers=HEADERS).json()["mission_count"] == 2
            )
            artifact = h.verifier.storage._path(
                UUID(done["verifications"][0]["evidence"][-1]["artifact_reference"])
            )
            original = artifact.read_bytes()
            try:
                artifact.write_bytes(b"explicit corruption test")
                current = client.get("/api/v1/mission-control", headers=HEADERS).json()
                assert current["latest_verdict"] == "INCONCLUSIVE"
                assert (
                    current["recent_verifications"][0]["session"]["final_verdict"]
                    == "VERIFIED_SUCCESS"
                )
            finally:
                artifact.write_bytes(original)
        finally:
            client.portal.call(h.close)


def test_real_rename_relocate_fault_with_explicit_fixture_diagnosis(tmp_path):
    h, services, fixture = stack(tmp_path, True)
    with TestClient(create_app(services)) as client:
        client.portal.call(h.start)
        try:
            m, e = prepare(client)
            assert (
                client.post(f"/api/v1/missions/{m['id']}/demo-fault", headers=HEADERS).status_code
                == 200
            )
            approve_start(client, e)
            done = settle(client, m["id"], True)
            assert done["mission"]["fault_injected"]
            assert done["recoveries"][0]["session"]["status"] == "RECOVERED"
            assert done["verification_report"]["effective_verdict"] == "VERIFIED_SUCCESS"
            assert fixture.calls == 1
            assert any(v["event_type"] == "demo_fault_activated" for v in done["events"])
            assert next(r for r in h.truth() if r["id"] == "PC-104")["version"] == 2
        finally:
            client.portal.call(h.close)


def test_meta_disabled_is_explicit_and_benchmark_evidence_is_actual(tmp_path):
    h, services, _ = stack(tmp_path)
    with TestClient(create_app(services)) as client:
        try:
            created = client.post(
                "/api/v1/missions", headers=HEADERS, json={"objective": GOAL, "mode": "meta"}
            ).json()
            response = client.post(f"/api/v1/missions/{created['id']}/prepare", headers=HEADERS)
            assert response.status_code == 409
            assert response.json()["error"]["code"] == "MODEL_CALLS_DISABLED"
            result = client.get(f"/api/v1/missions/{created['id']}", headers=HEADERS).json()
            assert result["mission"]["status"] == "FAILED" and result["plan"] is None
            reports = client.get("/api/v1/benchmarks").json()
            report = next(r for r in reports["items"] if r["report_id"] == "verification")
            assert report["data"]["verdict_accuracy"] == {"numerator": 5, "denominator": 5}
            assert report["data"]["model_calls"] == 0
            assert not reports["comparative_evaluation_available"]
            assert client.get("/api/v1/benchmarks/not-a-file").status_code == 404
        finally:
            client.portal.call(h.close)
