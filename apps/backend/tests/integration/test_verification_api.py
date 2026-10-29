import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

from inti.infrastructure.browser import PlaywrightBrowserAdapter
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.main import create_app
from inti.presentation.dependencies import Services

SCRIPTS = str(Path(__file__).resolve().parents[4] / "scripts")
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
from verification_harness import OPERATOR_TOKEN, VerificationHarness  # noqa: E402


def test_authorized_api_auto_verification_and_criteria_versions(tmp_path):
    harness = VerificationHarness(tmp_path)
    harness.execution.verification = harness.verifier
    services = Services(
        harness.config,
        harness.observations,
        harness.execution.storage,
        PlaywrightBrowserAdapter(harness.config, harness.execution.storage),
        MetaModelAPIAdapter(harness.config, harness.execution.storage),
        execution=harness.execution,
        verification=harness.verifier,
    )
    headers = {"Authorization": "Bearer " + OPERATOR_TOKEN}
    with TestClient(create_app(services)) as client:
        client.portal.call(harness.start)
        try:
            assert client.get("/api/v1/verifications").status_code == 401
            plan = client.post("/api/v1/executions/demo/prepare", headers=headers).json()
            id = plan["session"]["id"]
            base = f"/api/v1/executions/{id}"
            digest = plan["manifest"]["digest"]
            assert (
                client.post(
                    base + "/approve",
                    headers=headers,
                    json={"manifest_digest": digest, "scope": "plan"},
                ).status_code
                == 200
            )
            high = [a["id"] for a in plan["manifest"]["actions"] if a["risk_level"] == "HIGH"]
            assert (
                client.post(
                    base + "/approve",
                    headers=headers,
                    json={"manifest_digest": digest, "scope": "high_risk", "action_ids": high},
                ).status_code
                == 200
            )
            assert client.post(base + "/start", headers=headers).status_code == 202
            for _ in range(500):
                history = client.get(
                    "/api/v1/verifications", params={"execution_id": id}, headers=headers
                ).json()
                if history["items"] and history["items"][0]["session"]["status"] in {
                    "COMPLETED",
                    "FAILED",
                    "INCONCLUSIVE",
                }:
                    break
                time.sleep(0.03)
            assert history["total"] == 1, history
            verified = history["items"][0]
            assert verified["session"]["final_verdict"] == "VERIFIED_SUCCESS", verified
            verification_id = verified["session"]["id"]
            vbase = "/api/v1/verifications/" + verification_id
            assert client.get(vbase, headers=headers).status_code == 200
            assert (
                client.post(
                    "/api/v1/verifications", headers=headers, json={"execution_id": id}
                ).json()["session"]["id"]
                == verification_id
            )
            version = client.get(vbase + "/criteria", headers=headers).json()
            evidence = client.get(vbase + "/evidence", headers=headers).json()
            assert len(evidence) == 8
            artifact = vbase + "/evidence/" + evidence[0]["id"] + "/artifact"
            assert client.get(artifact).status_code == 401
            assert client.get(artifact, headers=headers).status_code == 200
            report = client.get(vbase + "/report", headers=headers).json()
            assert report["effective_verdict"] == "VERIFIED_SUCCESS"
            assert report["execution_summary"]["status"] == "COMPLETED"
            assert (
                client.get(vbase + "/report?format=html", headers=headers)
                .headers["content-type"]
                .startswith("text/html")
            )
            events = client.get(vbase + "/events", headers=headers).json()
            assert (
                client.get(
                    vbase + "/events", params={"after": events[-1]["sequence"]}, headers=headers
                ).json()
                == []
            )
            with client.websocket_connect(f"/ws/executions/{id}") as stream:
                stream.send_json({"token": OPERATOR_TOKEN, "after": 0})
                for _ in range(200):
                    event = stream.receive_json()
                    if event["event_type"] == "verification_completed":
                        assert event["payload"]["verification_id"] == verification_id
                        break
                else:
                    raise AssertionError(
                        "Verification event was not projected into the execution stream"
                    )
            additional = {
                "task_id": verified["session"]["task_id"],
                "description": "<script>untrusted description</script>",
                "assertion_type": "equals",
                "expected_value": "Operational",
                "target_reference": {"record_id": "PC-104", "field": "status"},
                "evidence_requirements": [{"evidence_type": "DATABASE_STATE", "min_count": 1}],
                "required": True,
            }
            revision = client.post(
                "/api/v1/verifications/criteria",
                headers=headers,
                json={
                    "execution_id": id,
                    "expected_version": version["version"],
                    "additional": [additional],
                    "reason": "Explicit additional read-only assertion",
                },
            )
            assert revision.status_code == 200, revision.text
            assert revision.json()["version"] == 2
            assert revision.json()["criteria"][:5] == version["criteria"]
            assert (
                client.post(
                    "/api/v1/verifications/criteria",
                    headers=headers,
                    json={
                        "execution_id": id,
                        "expected_version": 1,
                        "additional": [additional],
                        "reason": "Stale revision",
                    },
                ).status_code
                == 409
            )
            request = client.post(
                "/api/v1/verifications", headers=headers, json={"execution_id": id}
            )
            assert request.status_code == 201, request.text
            revised_id = request.json()["session"]["id"]
            assert revised_id != verification_id
            for _ in range(500):
                result = client.get("/api/v1/verifications/" + revised_id, headers=headers).json()
                if result["session"]["status"] in {"COMPLETED", "FAILED", "INCONCLUSIVE"}:
                    break
                time.sleep(0.03)
            assert result["session"]["final_verdict"] == "VERIFIED_SUCCESS", result
            html = client.get(
                "/api/v1/verifications/" + revised_id + "/report?format=html", headers=headers
            ).text
            assert "<script>untrusted" not in html and "&lt;script&gt;" in html
            cancelled = client.post(
                "/api/v1/verifications",
                headers=headers,
                json={"execution_id": id, "idempotency_key": "cancel-now"},
            ).json()
            cancel_id = cancelled["session"]["id"]
            response = client.post(
                "/api/v1/verifications/" + cancel_id + "/cancel", headers=headers
            )
            assert response.status_code == 200
            assert response.json()["session"]["status"] == "CANCELLED"
            assert response.json()["session"]["final_verdict"] == "INCONCLUSIVE"
        finally:
            client.portal.call(harness.close)
