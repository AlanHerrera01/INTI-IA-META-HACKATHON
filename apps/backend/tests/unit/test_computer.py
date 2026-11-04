from pathlib import Path
from uuid import uuid4

import pytest

from inti.domain.computer import ComputerPlan
from inti.infrastructure.computer_store import ComputerStore


def paired(tmp_path: Path):
    store = ComputerStore(tmp_path / "computer.db")
    code = store.pairing()["code"]
    device = store.enroll(code, "Fixture PC", "win32", str(tmp_path))
    return store, device, code


def plan(device: dict, tmp_path: Path):
    return ComputerPlan(
        id=uuid4(),
        device_id=device["id"],
        authorized_root=str(tmp_path),
        content="Unit fixture",
        url="https://example.com/",
    )


def test_pairing_once_and_no_credential_exports(tmp_path: Path):
    store, device, code = paired(tmp_path)
    store.authenticate(device["id"], device["secret"])
    with pytest.raises(ValueError):
        store.enroll(code, "Other", "win32", str(tmp_path))
    assert device["secret"] not in str(store.devices())
    with pytest.raises(ValueError):
        store.authenticate(device["id"], "wrong-token")


def test_review_exact_digest_and_claim_once(tmp_path: Path):
    store, device, _ = paired(tmp_path)
    task = store.create(plan(device, tmp_path))
    assert store.claim(device["id"]) is None
    with pytest.raises(ValueError):
        store.approve(task["id"], "changed-digest")
    store.approve(task["id"], task["digest"])
    claim = store.claim(device["id"])
    assert claim and claim["status"] == "RUNNING"
    assert store.claim(device["id"]) is None
    with pytest.raises(ValueError):
        store.receipt(device["id"], task["id"], "wrong-claim", {"ok": True})
    result = store.receipt(device["id"], task["id"], claim["claim"], {"ok": True})
    assert result["status"] == "COMPLETED"
    assert ComputerStore(store.path).get(task["id"])["status"] == "COMPLETED"


def test_cancel_and_revoke_prevent_queued_actions(tmp_path: Path):
    store, device, _ = paired(tmp_path)
    task = store.create(plan(device, tmp_path))
    store.approve(task["id"], task["digest"])
    store.cancel(task["id"])
    assert store.claim(device["id"]) is None
    store.revoke(device["id"])
    with pytest.raises(ValueError):
        store.authenticate(device["id"], device["secret"])


def test_expired_running_task_is_not_replayed_or_acknowledged(tmp_path: Path):
    store, device, _ = paired(tmp_path)
    task = store.create(plan(device, tmp_path))
    store.approve(task["id"], task["digest"])
    claim = store.claim(device["id"])
    with store.connection() as db:
        db.execute("UPDATE computer_tasks SET updated=0 WHERE id=?", (task["id"],))
    assert store.claim(device["id"]) is None
    assert store.get(task["id"])["status"] == "INTERRUPTED"
    with pytest.raises(ValueError, match="interrupted"):
        store.receipt(device["id"], task["id"], claim["claim"], {"ok": True})
    with pytest.raises(ValueError):
        store.approve(task["id"], task["digest"])


def test_progress_cannot_rewrite_receipts_or_cross_device(tmp_path: Path):
    store, device, _ = paired(tmp_path)
    task = store.create(plan(device, tmp_path))
    store.approve(task["id"], task["digest"])
    claim = store.claim(device["id"])
    steps = [{"id": "write_file", "status": "VERIFIED_READBACK", "sha256": "a" * 64}]
    store.progress(device["id"], task["id"], claim["claim"], steps)
    with pytest.raises(ValueError, match="cannot be replaced"):
        store.progress(device["id"], task["id"], claim["claim"], [])
    with pytest.raises(ValueError):
        store.progress(str(uuid4()), task["id"], claim["claim"], steps)
    assert store.get(task["id"])["result"]["steps"] == steps


@pytest.mark.parametrize(
    "filename",
    ["../escape.txt", "C:\\secret.txt", "NUL.txt", "COM1.txt", "script.ps1", "file.txt:stream"],
)
def test_only_safe_new_text_file_names(filename: str):
    with pytest.raises(ValueError):
        ComputerPlan(
            id=uuid4(),
            device_id=uuid4(),
            authorized_root="fixture",
            filename=filename,
            content="fixture",
        )


@pytest.mark.parametrize(
    "url",
    ["file:///C:/private", "javascript:alert(1)", "https://user:secret@example.com", "not a URL"],
)
def test_no_file_script_or_credential_browser_urls(url: str):
    with pytest.raises(ValueError):
        ComputerPlan(
            id=uuid4(), device_id=uuid4(), authorized_root="fixture", content="fixture", url=url
        )
