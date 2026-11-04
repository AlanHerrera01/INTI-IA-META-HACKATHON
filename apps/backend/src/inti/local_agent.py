"""User-installed Windows agent. Polls outbound; exposes no listening control port."""

import argparse
import getpass
import hashlib
import json
import os
import socket
import stat
import subprocess
import sys
import time
import webbrowser
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx

from inti.domain.computer import (
    ApplicationLaunchPlan,
    ComputerApplication,
    ComputerPlan,
    parse_computer_plan,
)
from inti.local_applications import discover_applications, launch_application


def private_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".new")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(value, stream)
    os.replace(temporary, path)
    os.chmod(path, 0o600)


def reject_links(path: Path) -> None:
    for part in [*reversed(path.parents), path]:
        if part.exists() or part.is_symlink():
            info = part.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
                raise ValueError("Authorized folders cannot contain symlinks or reparse points")


def create_text(plan: ComputerPlan, authorized_root: Path) -> dict[str, Any]:
    root = authorized_root.absolute()
    reject_links(root)
    if Path(plan.authorized_root).resolve() != root.resolve():
        raise ValueError("Task folder differs from the locally authorized folder")
    root.mkdir(parents=True, exist_ok=True)
    folder = root / str(plan.id)
    folder.mkdir(exist_ok=False)
    reject_links(folder)
    path = folder / plan.filename
    content = plan.content.encode("utf-8")
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_BINARY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    reject_links(path)
    actual = path.read_bytes()
    if actual != content:
        raise ValueError("Persisted file differs from the approved content")
    return {
        "id": "write_file",
        "status": "VERIFIED_READBACK",
        "path": str(path),
        "sha256": hashlib.sha256(actual).hexdigest(),
        "bytes": len(actual),
    }


def open_notepad(path: Path) -> dict[str, Any]:
    if sys.platform != "win32":
        raise ValueError("Notepad actions require Windows")
    executable = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "notepad.exe"
    process = subprocess.Popen([str(executable), str(path)], shell=False)
    return {
        "id": "open_notepad",
        "status": "LAUNCH_REQUESTED",
        "pid": process.pid,
        "path": str(path),
    }


def open_browser(url: str) -> dict[str, Any]:
    if not webbrowser.open(url, new=2):
        raise ValueError("The default browser did not accept the launch request")
    return {"id": "open_browser", "status": "LAUNCH_REQUESTED", "url": url}


def execute_task(
    task: dict[str, Any],
    root: Path,
    still_allowed: Callable[[], bool],
    notepad: Callable[[Path], dict[str, Any]] = open_notepad,
    browser: Callable[[str], dict[str, Any]] = open_browser,
    on_step: Callable[[list[dict[str, Any]]], None] | None = None,
    application: Callable[[ComputerApplication], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {"ok": False, "cancelled": False, "steps": [], "error": None}
    try:
        plan = parse_computer_plan(task["plan"])
        if task["digest"] != plan.digest():
            raise ValueError("Reviewed manifest digest does not match")
        from inti.domain.documents import DocumentPlan

        if isinstance(plan, DocumentPlan):
            from inti.local_documents import create_document_package

            def document_progress(steps: list[dict]) -> None:
                result["steps"] = list(steps)
                if on_step:
                    on_step(result["steps"])

            result["steps"] = create_document_package(plan, root, still_allowed, document_progress)
            result["ok"] = True
            return result
        if isinstance(plan, ApplicationLaunchPlan):
            if Path(plan.authorized_root).resolve() != root.resolve():
                raise ValueError("Task folder differs from the locally authorized folder")
            if not still_allowed():
                result["cancelled"] = True
                raise ValueError("Application launch cancelled before execution")
            result["steps"].append(
                application(plan.application)
                if application
                else launch_application(plan.application, still_allowed)
            )
            if on_step:
                on_step(result["steps"])
            result["ok"] = True
            return result
        if not still_allowed():
            result["cancelled"] = True
            raise ValueError("Execution cancelled before file creation")
        file = create_text(plan, root)
        result["steps"].append(file)
        if on_step:
            on_step(result["steps"])
        if not still_allowed():
            result["cancelled"] = True
            raise ValueError("Remaining actions cancelled; created file is retained")
        reject_links(Path(file["path"]))
        result["steps"].append(notepad(Path(file["path"])))
        if on_step:
            on_step(result["steps"])
        if not still_allowed():
            result["cancelled"] = True
            raise ValueError("Browser action cancelled; earlier actions are retained")
        result["steps"].append(browser(plan.url))
        if on_step:
            on_step(result["steps"])
        result["ok"] = True
    except Exception as error:
        result["error"] = str(error)[:500]
    return result


def server_url(value: str) -> str:
    parsed = urlsplit(value)
    if (
        not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError("Use a backend origin without credentials, path or query")
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise ValueError("Remote servers require HTTPS; HTTP is allowed only on loopback")
    return value.rstrip("/")


def main() -> None:
    parser = argparse.ArgumentParser(description="INTI authorized Windows local agent")
    parser.add_argument("--backend", default="http://127.0.0.1:8000")
    parser.add_argument("--state", type=Path, default=Path(".local/computer-agent.json"))
    parser.add_argument("--workspace", type=Path, default=Path("artifacts/computer-workspace"))
    parser.add_argument("--pair-file", type=Path)
    args = parser.parse_args()
    if sys.platform != "win32":
        raise SystemExit("This release executes Windows tasks only")
    root = args.workspace.absolute()
    reject_links(root)
    root.mkdir(parents=True, exist_ok=True)
    pending_file = args.state.with_suffix(".pending.json")
    if args.state.exists():
        config = json.loads(args.state.read_text(encoding="utf-8"))
        if Path(config["root"]).resolve() != root.resolve():
            raise SystemExit(
                "Use the originally paired workspace, or re-pair with a new state file"
            )
    else:
        pairing = (
            json.loads(args.pair_file.read_text(encoding="utf-8"))
            if args.pair_file
            else {"backend": args.backend, "code": getpass.getpass("One-time pairing code: ")}
        )
        backend = server_url(pairing["backend"])
        with httpx.Client(base_url=backend, timeout=10, trust_env=False) as client:
            response = client.post(
                "/api/v1/computer/enroll",
                json={
                    "code": pairing["code"],
                    "name": socket.gethostname(),
                    "platform": sys.platform,
                    "root": str(root),
                },
            )
            response.raise_for_status()
            config = {**response.json(), "backend": backend, "root": str(root)}
        private_json(args.state, config)
        if args.pair_file:
            args.pair_file.unlink()
    backend = server_url(config["backend"])
    prefix = f"/api/v1/computer/devices/{config['id']}"
    print(f"INTI agent connected. Authorized folder: {root}", flush=True)
    print(
        "Reviewed text-file, browser and authorized application launches only. "
        "Ctrl+C stops this agent.",
        flush=True,
    )
    with httpx.Client(
        base_url=backend,
        headers={"Authorization": "Bearer " + config["secret"]},
        timeout=10,
        trust_env=False,
    ) as client:
        last_catalog = 0.0
        while True:
            try:
                if time.monotonic() - last_catalog > 30:
                    last_catalog = time.monotonic()
                    try:
                        applications = discover_applications()
                    except (OSError, ValueError, subprocess.SubprocessError):
                        print(
                            "Application discovery unavailable; previous catalog will expire.",
                            flush=True,
                        )
                    else:
                        report = client.post(
                            prefix + "/applications",
                            json={"applications": [app.model_dump() for app in applications]},
                        )
                        report.raise_for_status()
                if pending_file.exists():
                    pending = json.loads(pending_file.read_text(encoding="utf-8"))
                    if pending["phase"] != "RESULT":
                        pending["result"] = {
                            "ok": False,
                            "cancelled": False,
                            "steps": pending.get("steps", []),
                            "error": (
                                "Agent interrupted during an action. Actions will not be replayed; "
                                "inspect the authorized folder."
                            ),
                        }
                    response = client.post(
                        f"{prefix}/tasks/{pending['id']}/receipt",
                        json={"claim": pending["claim"], **pending["result"]},
                    )
                    response.raise_for_status()
                    pending_file.unlink()
                response = client.post(prefix + "/claim")
                response.raise_for_status()
                task = response.json()["task"]
                if task:
                    if task["device_id"] != config["id"]:
                        raise ValueError("Task belongs to a different paired device")
                    pending = {"id": task["id"], "claim": task["claim"], "phase": "EXECUTING"}
                    private_json(pending_file, pending)

                    def allowed(task: dict[str, Any] = task) -> bool:
                        state = client.get(f"{prefix}/tasks/{task['id']}")
                        state.raise_for_status()
                        return bool(
                            state.json()["status"] == "RUNNING"
                            and state.json()["digest"] == task["digest"]
                        )

                    def progress(
                        steps: list[dict[str, Any]],
                        task: dict[str, Any] = task,
                        pending: dict[str, Any] = pending,
                    ) -> None:
                        pending["steps"] = steps
                        private_json(pending_file, pending)
                        response = client.post(
                            f"{prefix}/tasks/{task['id']}/progress",
                            json={"claim": task["claim"], "steps": steps},
                        )
                        response.raise_for_status()
                        time.sleep(1)

                    pending.update(
                        phase="RESULT", result=execute_task(task, root, allowed, on_step=progress)
                    )
                    private_json(pending_file, pending)
                    print(f"Task {task['id']}: action receipt ready", flush=True)
            except httpx.HTTPStatusError as error:
                if error.response.status_code in {401, 403}:
                    raise SystemExit(
                        "Device access was revoked or rejected. Re-pair explicitly."
                    ) from None
                print(
                    f"Server rejected a request ({error.response.status_code}); no action replay.",
                    flush=True,
                )
            except (httpx.HTTPError, OSError, ValueError):
                print(
                    "Agent waiting for connection or acknowledgement; no action replay.", flush=True
                )
            time.sleep(2)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Local agent stopped. Existing files and application windows are retained.")
