from pathlib import Path
from uuid import uuid4

import pytest

from inti.domain.computer import ComputerPlan
from inti.local_agent import create_text, execute_task, server_url


def fixture_task(tmp_path: Path):
    plan = ComputerPlan(
        id=uuid4(),
        device_id=uuid4(),
        authorized_root=str(tmp_path),
        content="Actual file fixture\nsecond line",
    )
    return plan, {"plan": plan.model_dump(mode="json"), "digest": plan.digest()}


def test_actual_new_file_readback_and_no_overwrite(tmp_path: Path):
    plan, _ = fixture_task(tmp_path)
    result = create_text(plan, tmp_path)
    assert Path(result["path"]).read_bytes() == plan.content.encode()
    assert result["status"] == "VERIFIED_READBACK"
    with pytest.raises(FileExistsError):
        create_text(plan, tmp_path)


def test_exact_manifest_and_locally_authorized_root(tmp_path: Path):
    plan, task = fixture_task(tmp_path)
    task["digest"] = "changed"
    result = execute_task(task, tmp_path, lambda: True)
    assert not result["ok"] and result["steps"] == []
    assert not (tmp_path / str(plan.id)).exists()
    with pytest.raises(ValueError):
        create_text(plan, tmp_path / "different-root")


def test_cancellation_retains_file_but_prevents_app_launch(tmp_path: Path):
    _, task = fixture_task(tmp_path)
    checks = iter([True, False])
    launched = []
    result = execute_task(
        task,
        tmp_path,
        lambda: next(checks),
        lambda path: launched.append(path),
        lambda url: launched.append(url),
    )
    assert result["cancelled"] and not result["ok"]
    assert len(result["steps"]) == 1 and not launched


def test_launch_receipts_are_not_visual_verification(tmp_path: Path):
    _, task = fixture_task(tmp_path)
    result = execute_task(
        task,
        tmp_path,
        lambda: True,
        lambda path: {"id": "open_notepad", "status": "LAUNCH_REQUESTED"},
        lambda url: {"id": "open_browser", "status": "LAUNCH_REQUESTED"},
    )
    assert result["ok"]
    assert result["steps"][1]["status"] == "LAUNCH_REQUESTED"


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "file:///private",
        "https://user:secret@example.com",
        "https://example.com/path",
    ],
)
def test_backend_credentials_require_loopback_or_https_origin(url: str):
    with pytest.raises(ValueError):
        server_url(url)
