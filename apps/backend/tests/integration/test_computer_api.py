from pathlib import PureWindowsPath

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from inti.main import create_app

TOKEN = "fixture-computer-operator-capability"


def test_document_draft_requires_exact_approval_and_matching_receipts(computer_client):
    from inti.domain.documents import DOCUMENT_OUTPUTS, DocumentRequest

    client = computer_client
    device, operator, agent = enroll(client)
    data = {
        "reference": "INTI-EC-104",
        "customer": "Cliente ficticio Andes",
        "contact": "Daniela Demo",
        "email": "demo@example.com",
        "city": "Quito",
        "issued": "2026-11-03",
        "valid_until": "2026-11-18",
        "tax_basis_points": 1500,
        "items": [{"description": "Servicio de ejemplo", "quantity": 2, "unit_cents": 12000}],
    }
    assert client.post(
        "/api/v1/computer/document-tasks",
        json={"device_id": device["id"], "document_request": data},
    ).status_code in {401, 403}
    invalid = client.post(
        "/api/v1/computer/document-tasks",
        headers=operator,
        json={"device_id": device["id"], "document_request": {**data, "email": ""}},
    )
    assert invalid.status_code == 422
    result = client.post(
        "/api/v1/computer/document-tasks",
        headers=operator,
        json={"device_id": device["id"], "document_request": data},
    )
    assert result.status_code == 200
    task = result.json()
    assert task["plan"]["kind"] == "create_documents" and len(task["steps"]) == 6
    assert task["plan"]["content"] == DocumentRequest(**data).summary()
    prefix = f"/api/v1/computer/devices/{device['id']}"
    assert client.post(prefix + "/claim", headers=agent).json()["task"] is None
    client.post(
        f"/api/v1/computer/tasks/{task['id']}/approve",
        headers=operator,
        json={"digest": task["digest"]},
    ).raise_for_status()
    claim = client.post(prefix + "/claim", headers=agent).json()["task"]
    receipts = [{"id": "validate_document_data", "status": "VALIDATED", "sha256": task["digest"]}]
    receipts += [
        {
            "id": step,
            "status": "VERIFIED_READBACK",
            "sha256": "a" * 64,
            "bytes": 100,
            "path": str(PureWindowsPath(task["plan"]["authorized_root"]) / task["id"] / name),
        }
        for step, name in DOCUMENT_OUTPUTS
    ]
    endpoint = f"{prefix}/tasks/{task['id']}/receipt"
    bad = [dict(step) for step in receipts]
    bad[1]["path"] = r"C:\outside\cotizacion.docx"
    assert (
        client.post(
            endpoint, headers=agent, json={"claim": claim["claim"], "ok": True, "steps": bad}
        ).status_code
        == 409
    )
    assert (
        client.post(
            endpoint, headers=agent, json={"claim": claim["claim"], "ok": True, "steps": receipts}
        ).json()["status"]
        == "COMPLETED"
    )


def test_application_catalog_permissions_and_exact_launch_receipt(computer_client):
    client = computer_client
    device, operator, agent = enroll(client)
    other, _, _ = enroll(client)
    prefix = f"/api/v1/computer/devices/{device['id']}"
    app = {
        "id": "a" * 64,
        "identity": "b" * 64,
        "name": "Fixture App",
        "path": r"C:\Program Files\Fixture\app.exe",
    }
    assert client.post(prefix + "/applications", json={"applications": [app]}).status_code in {
        401,
        403,
    }
    assert client.post(
        f"/api/v1/computer/devices/{other['id']}/applications",
        headers=agent,
        json={"applications": [app]},
    ).status_code in {401, 403}
    assert (
        client.post(
            prefix + "/applications", headers=agent, json={"applications": [app]}
        ).status_code
        == 200
    )
    payload = {"device_id": device["id"], "application_id": app["id"], "identity": app["identity"]}
    assert (
        client.post(
            "/api/v1/computer/application-tasks", headers=operator, json=payload
        ).status_code
        == 409
    )
    permission = f"/api/v1/computer/applications/{device['id']}/{app['id']}/permission"
    assert client.post(
        permission, headers=agent, json={"identity": app["identity"], "allowed": True}
    ).status_code in {401, 403}
    assert (
        client.post(
            permission, headers=operator, json={"identity": app["identity"], "allowed": True}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/computer/application-tasks",
            headers=operator,
            json={**payload, "path": r"C:\Windows\System32\cmd.exe"},
        ).status_code
        == 422
    )
    task = client.post("/api/v1/computer/application-tasks", headers=operator, json=payload).json()
    assert client.post(prefix + "/claim", headers=agent).json()["task"] is None
    assert (
        client.post(
            f"/api/v1/computer/tasks/{task['id']}/approve",
            headers=operator,
            json={"digest": task["digest"]},
        ).status_code
        == 200
    )
    claim = client.post(prefix + "/claim", headers=agent).json()["task"]
    result = {
        "claim": claim["claim"],
        "ok": True,
        "steps": [
            {
                "id": "open_application",
                "status": "LAUNCH_REQUESTED",
                "path": app["path"],
                "application_id": app["id"],
                "identity": app["identity"],
                "pid": 123,
            }
        ],
    }
    endpoint = prefix + f"/tasks/{task['id']}/receipt"
    wrong = {**result, "steps": [{**result["steps"][0], "identity": "c" * 64}]}
    assert client.post(endpoint, headers=agent, json=wrong).status_code == 409
    assert client.post(endpoint, headers=agent, json=result).json()["status"] == "COMPLETED"


@pytest.fixture
def computer_client(services):
    services.settings.inti_runtime_mode = "local_computer"
    services.settings.execution_enabled = False
    services.settings.execution_operator_token = SecretStr(TOKEN)
    with TestClient(create_app(services)) as client:
        yield client


def enroll(client):
    headers = {"Authorization": "Bearer " + TOKEN}
    code = client.post("/api/v1/computer/pairing", headers=headers).json()["code"]
    response = client.post(
        "/api/v1/computer/enroll",
        json={
            "code": code,
            "name": "Unit fixture PC",
            "platform": "win32",
            "root": r"C:\INTI-fixture",
        },
    )
    assert response.status_code == 200
    device = response.json()
    return device, headers, {"Authorization": "Bearer " + device["secret"]}


def test_new_mode_does_not_mount_sandbox_actions(computer_client):
    assert computer_client.get("/api/v1/capabilities").json()["runtime_mode"] == "local_computer"
    assert computer_client.get("/api/v1/demo/status").status_code == 404
    assert computer_client.get("/api/v1/executions").status_code == 404
    assert computer_client.post("/api/v1/computer/pairing").status_code in {401, 403}


def test_paired_device_can_only_claim_reviewed_task_and_submit_matching_receipts(computer_client):
    device, operator, agent = enroll(computer_client)
    response = computer_client.post(
        "/api/v1/computer/tasks",
        headers=operator,
        json={
            "device_id": device["id"],
            "filename": "fixture.txt",
            "content": "Fixture text",
            "url": "https://example.com/",
        },
    )
    assert response.status_code == 200
    task = response.json()
    prefix = f"/api/v1/computer/devices/{device['id']}"
    assert computer_client.post(prefix + "/claim", headers=agent).json()["task"] is None
    assert (
        computer_client.post(
            f"/api/v1/computer/tasks/{task['id']}/approve",
            headers=operator,
            json={"digest": "0" * 64},
        ).status_code
        == 409
    )
    assert (
        computer_client.post(
            f"/api/v1/computer/tasks/{task['id']}/approve",
            headers=operator,
            json={"digest": task["digest"]},
        ).status_code
        == 200
    )
    claimed = computer_client.post(prefix + "/claim", headers=agent).json()["task"]
    assert claimed["id"] == task["id"]
    receipt_url = prefix + f"/tasks/{task['id']}/receipt"
    bad = computer_client.post(
        receipt_url, headers=agent, json={"claim": claimed["claim"], "ok": True, "steps": []}
    )
    assert bad.status_code == 409
    path = str(PureWindowsPath(task["plan"]["authorized_root"]) / task["id"] / "fixture.txt")
    import hashlib

    steps = [
        {
            "id": "write_file",
            "status": "VERIFIED_READBACK",
            "path": path,
            "sha256": hashlib.sha256(b"Fixture text").hexdigest(),
            "bytes": len(b"Fixture text"),
        },
        {"id": "open_notepad", "status": "LAUNCH_REQUESTED", "path": path, "pid": 123},
        {"id": "open_browser", "status": "LAUNCH_REQUESTED", "url": "https://example.com/"},
    ]
    progress = computer_client.post(
        prefix + f"/tasks/{task['id']}/progress",
        headers=agent,
        json={"claim": claimed["claim"], "steps": steps[:1]},
    )
    assert progress.status_code == 200
    assert (
        computer_client.get("/api/v1/computer/state", headers=operator).json()["tasks"][0]["status"]
        == "RUNNING"
    )
    result = computer_client.post(
        receipt_url, headers=agent, json={"claim": claimed["claim"], "ok": True, "steps": steps}
    )
    assert result.status_code == 200 and result.json()["status"] == "COMPLETED"
    exported = computer_client.get("/api/v1/computer/state", headers=operator).text
    assert device["secret"] not in exported and claimed["claim"] not in exported


def test_revoke_blocks_device_and_cancels_pending_work(computer_client):
    device, operator, agent = enroll(computer_client)
    result = computer_client.post(
        f"/api/v1/computer/devices/{device['id']}/revoke", headers=operator
    )
    assert result.status_code == 200
    assert computer_client.post(
        f"/api/v1/computer/devices/{device['id']}/claim", headers=agent
    ).status_code in {401, 403}
