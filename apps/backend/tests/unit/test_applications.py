from pathlib import Path
from unittest.mock import Mock
from uuid import uuid4

import pytest

from inti.domain.computer import ApplicationLaunchPlan, ComputerApplication
from inti.infrastructure.computer_store import ComputerStore
from inti.local_agent import execute_task
from inti.local_applications import application_entry, launch_application


def setup(tmp_path):
    store = ComputerStore(tmp_path / "ledger.sqlite")
    device = store.enroll(store.pairing()["code"], "Fixture", "win32", str(tmp_path))
    app = ComputerApplication(
        id="a" * 64, identity="b" * 64, name="Fixture App", path=r"C:\Program Files\Fixture\app.exe"
    )
    store.publish_applications(device["id"], [app])
    plan = ApplicationLaunchPlan(
        id=uuid4(), device_id=device["id"], authorized_root=str(tmp_path), application=app
    )
    return store, device, app, plan


def test_launch_requires_permission_exact_approval_and_revocation_stops_claim(tmp_path):
    store, device, app, plan = setup(tmp_path)
    with pytest.raises(ValueError):
        store.create(plan)
    store.permit_application(device["id"], app.id, app.identity, True)
    task = store.create(plan)
    assert store.claim(device["id"]) is None
    with pytest.raises(ValueError):
        store.approve(task["id"], "0" * 64)
    store.approve(task["id"], task["digest"])
    store.permit_application(device["id"], app.id, app.identity, False)
    assert store.claim(device["id"]) is None
    assert store.get(task["id"])["status"] == "CANCELLED"


def test_catalog_change_removes_permission_and_invalidates_reviewed_task(tmp_path):
    store, device, app, plan = setup(tmp_path)
    store.permit_application(device["id"], app.id, app.identity, True)
    task = store.create(plan)
    changed = app.model_copy(update={"identity": "c" * 64})
    store.publish_applications(device["id"], [changed])
    assert not store.applications(device["id"])["applications"][0]["allowed"]
    assert store.get(task["id"])["status"] == "CANCELLED"
    with pytest.raises(ValueError):
        store.permit_application(device["id"], app.id, app.identity, True)


def test_stale_catalog_and_other_device_cannot_authorize_launch(tmp_path):
    store, device, app, plan = setup(tmp_path)
    with pytest.raises(ValueError):
        store.permit_application(str(uuid4()), app.id, app.identity, True)
    store.permit_application(device["id"], app.id, app.identity, True)
    task = store.create(plan)
    with store.connection() as db:
        db.execute("UPDATE computer_applications SET scanned=0")
    with pytest.raises(ValueError):
        store.approve(task["id"], task["digest"])
    with pytest.raises(ValueError):
        store.permit_application(device["id"], app.id, app.identity, True)


def test_removed_catalog_entry_cancels_running_task(tmp_path):
    store, device, app, plan = setup(tmp_path)
    store.permit_application(device["id"], app.id, app.identity, True)
    task = store.create(plan)
    store.approve(task["id"], task["digest"])
    assert store.claim(device["id"])
    store.publish_applications(device["id"], [])
    assert store.get(task["id"])["status"] == "CANCELLED"
    with pytest.raises(ValueError):
        store.agent_state(device["id"], task["id"])


def test_agent_no_arguments_or_shell_and_revalidates_identity(tmp_path, monkeypatch):
    executable = tmp_path / "fixture.exe"
    executable.write_bytes(b"test fixture, never executed")
    app = application_entry("Fixture", executable)
    assert app
    monkeypatch.setattr("inti.local_applications.discover_applications", lambda: [app])
    launch = Mock(return_value=Mock(pid=123))
    monkeypatch.setattr("inti.local_applications.subprocess.Popen", launch)
    receipt = launch_application(app)
    assert receipt["status"] == "LAUNCH_REQUESTED"
    launch.assert_called_once_with([app.path], cwd=str(executable.parent), shell=False)
    with pytest.raises(ValueError, match="cancelled"):
        launch_application(app, lambda: False)
    assert launch.call_count == 1
    executable.write_bytes(b"changed fixture")
    with pytest.raises(ValueError):
        launch_application(app)
    assert launch.call_count == 1


def test_agent_application_task_does_not_create_files_and_checks_cancellation(tmp_path):
    _, _, app, plan = setup(tmp_path)
    task = {"plan": plan.model_dump(mode="json"), "digest": plan.digest()}
    launch = Mock(return_value={"id": "open_application", "status": "LAUNCH_REQUESTED"})
    result = execute_task(task, tmp_path, lambda: False, application=launch)
    assert result["cancelled"] and not result["ok"]
    launch.assert_not_called()
    result = execute_task(task, tmp_path, lambda: True, application=launch)
    assert result["ok"] and len(result["steps"]) == 1
    assert not (tmp_path / str(plan.id)).exists()


@pytest.mark.parametrize("name", ["cmd.exe", "powershell.exe", "script.ps1", "node.exe"])
def test_discovery_rejects_console_tools_and_non_executables(tmp_path: Path, name):
    file = tmp_path / name
    file.write_bytes(b"fixture")
    assert application_entry("Fixture", file) is None


def test_discovery_excludes_packaged_app_executables(tmp_path):
    folder = tmp_path / "WindowsApps" / "FixturePackage"
    folder.mkdir(parents=True)
    executable = folder / "fixture.exe"
    executable.write_bytes(b"fixture")
    assert application_entry("Fixture", executable) is None
