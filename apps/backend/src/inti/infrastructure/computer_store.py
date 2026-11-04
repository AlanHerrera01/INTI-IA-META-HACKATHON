"""Small durable ledger isolated from the former inventory execution domain."""

import hashlib
import json
import secrets
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from uuid import uuid4

from inti.domain.computer import (
    ApplicationLaunchPlan,
    ComputerApplication,
    ComputerPlan,
    parse_computer_plan,
)


class ComputerStore:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS pairing (hash TEXT PRIMARY KEY, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL,
                    name TEXT NOT NULL, platform TEXT NOT NULL, root TEXT NOT NULL,
                    last_seen REAL NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS computer_tasks (
                    id TEXT PRIMARY KEY, device_id TEXT NOT NULL,
                    status TEXT NOT NULL, plan TEXT NOT NULL, digest TEXT NOT NULL,
                    created REAL NOT NULL, updated REAL NOT NULL, result TEXT, claim TEXT);
                CREATE TABLE IF NOT EXISTS computer_applications (
                    device_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
                    allowed INTEGER NOT NULL DEFAULT 0, scanned REAL NOT NULL,
                    PRIMARY KEY(device_id,id));
                CREATE TABLE IF NOT EXISTS computer_catalogs (
                    device_id TEXT PRIMARY KEY, scanned REAL NOT NULL);
            """)

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=5)
        try:
            db.row_factory = sqlite3.Row
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def hashed(value: str) -> str:
        return hashlib.sha256(value.encode()).hexdigest()

    def pairing(self) -> dict[str, Any]:
        code = secrets.token_urlsafe(32)
        expires = time.time() + 300
        with self.connection() as db:
            db.execute("DELETE FROM pairing WHERE expires < ?", (time.time(),))
            db.execute("INSERT INTO pairing VALUES (?, ?)", (self.hashed(code), expires))
        return {"code": code, "expires_at": expires}

    def enroll(self, code: str, name: str, platform: str, root: str) -> dict[str, Any]:
        if platform != "win32":
            raise ValueError("This release requires a Windows agent")
        id, secret = str(uuid4()), secrets.token_urlsafe(32)
        with self.connection() as db:
            row = db.execute(
                "SELECT expires FROM pairing WHERE hash=?", (self.hashed(code),)
            ).fetchone()
            if row is None or row["expires"] < time.time():
                raise ValueError("Pairing code is invalid, expired or already used")
            db.execute("DELETE FROM pairing WHERE hash=?", (self.hashed(code),))
            db.execute(
                "INSERT INTO devices VALUES (?,?,?,?,?,?,0)",
                (id, self.hashed(secret), name, platform, root, time.time()),
            )
        return {"id": id, "secret": secret}

    def authenticate(self, id: str, secret: str) -> None:
        with self.connection() as db:
            row = db.execute("SELECT secret_hash,revoked FROM devices WHERE id=?", (id,)).fetchone()
            if (
                row is None
                or row["revoked"]
                or not secrets.compare_digest(row["secret_hash"], self.hashed(secret))
            ):
                raise ValueError("Device capability is invalid or revoked")

    def devices(self) -> list[dict[str, Any]]:
        with self.connection() as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT id,name,platform,root,last_seen,revoked FROM devices "
                    "ORDER BY last_seen DESC"
                )
            ]

    def revoke(self, id: str) -> None:
        with self.connection() as db:
            db.execute("UPDATE devices SET revoked=1 WHERE id=?", (id,))
            db.execute(
                "UPDATE computer_tasks SET status='CANCELLED',updated=? WHERE "
                "device_id=? AND status IN ('DRAFT','QUEUED','RUNNING')",
                (time.time(), id),
            )

    @staticmethod
    def check_application(
        db: sqlite3.Connection, plan: ComputerPlan | ApplicationLaunchPlan
    ) -> None:
        if not isinstance(plan, ApplicationLaunchPlan):
            return
        row = db.execute(
            "SELECT payload,allowed,scanned FROM computer_applications WHERE device_id=? AND id=?",
            (str(plan.device_id), plan.application.id),
        ).fetchone()
        if (
            row is None
            or not row["allowed"]
            or time.time() - row["scanned"] > 90
            or ComputerApplication.model_validate_json(row["payload"]) != plan.application
        ):
            raise ValueError("Application is not authorized or its catalog is stale")

    def publish_applications(self, device: str, applications: list[ComputerApplication]) -> None:
        if len({app.id for app in applications}) != len(applications):
            raise ValueError("Duplicate application identifiers")
        now = time.time()
        with self.connection() as db:
            for app in applications:
                previous = db.execute(
                    "SELECT payload,allowed FROM computer_applications WHERE device_id=? AND id=?",
                    (device, app.id),
                ).fetchone()
                allowed = int(
                    bool(
                        previous
                        and previous["allowed"]
                        and ComputerApplication.model_validate_json(previous["payload"]) == app
                    )
                )
                db.execute(
                    "INSERT OR REPLACE INTO computer_applications VALUES (?,?,?,?,?)",
                    (device, app.id, app.model_dump_json(), allowed, now),
                )
            db.execute(
                "DELETE FROM computer_applications WHERE device_id=? AND scanned<>?", (device, now)
            )
            db.execute("INSERT OR REPLACE INTO computer_catalogs VALUES (?,?)", (device, now))
            self.cancel_invalid_applications(db, device)

    def applications(self, device: str) -> dict[str, Any]:
        with self.connection() as db:
            rows = db.execute(
                "SELECT * FROM computer_applications WHERE device_id=?", (device,)
            ).fetchall()
            scan = db.execute(
                "SELECT scanned FROM computer_catalogs WHERE device_id=?", (device,)
            ).fetchone()
        return {
            "applications": [
                {**json.loads(row["payload"]), "allowed": bool(row["allowed"])} for row in rows
            ],
            "scanned_at": scan["scanned"] if scan else None,
        }

    def permit_application(self, device: str, app_id: str, identity: str, allowed: bool) -> None:
        with self.connection() as db:
            row = db.execute(
                "SELECT * FROM computer_applications WHERE device_id=? AND id=?", (device, app_id)
            ).fetchone()
            target = db.execute(
                "SELECT revoked,last_seen FROM devices WHERE id=?", (device,)
            ).fetchone()
            if not row or not target or target["revoked"]:
                raise ValueError("Application or paired device is unavailable")
            if ComputerApplication.model_validate_json(row["payload"]).identity != identity:
                raise ValueError("Application identity changed; review the current catalog")
            if allowed and (
                time.time() - row["scanned"] > 90 or time.time() - target["last_seen"] > 30
            ):
                raise ValueError("Reconnect the agent to authorize an application")
            db.execute(
                "UPDATE computer_applications SET allowed=? WHERE device_id=? AND id=?",
                (int(allowed), device, app_id),
            )
            self.cancel_invalid_applications(db, device)

    def cancel_invalid_applications(self, db: sqlite3.Connection, device: str) -> None:
        for row in db.execute(
                "SELECT id,plan FROM computer_tasks WHERE device_id=? "
                "AND status IN ('DRAFT','QUEUED','RUNNING')",
            (device,),
        ).fetchall():
            plan = parse_computer_plan(json.loads(row["plan"]))
            try:
                self.check_application(db, plan)
            except ValueError:
                db.execute(
                    "UPDATE computer_tasks SET status='CANCELLED',updated=? WHERE id=?",
                    (time.time(), row["id"]),
                )

    def create(self, plan: ComputerPlan | ApplicationLaunchPlan) -> dict[str, Any]:
        with self.connection() as db:
            self.check_application(db, plan)
            device = db.execute(
                "SELECT root,revoked,last_seen FROM devices WHERE id=?", (str(plan.device_id),)
            ).fetchone()
            if not device or device["revoked"] or device["root"] != plan.authorized_root:
                raise ValueError("Device or authorized folder does not match")
            if time.time() - device["last_seen"] > 30:
                raise ValueError("The local agent is offline; reconnect it before planning")
            now = time.time()
            db.execute(
                "INSERT INTO computer_tasks VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    str(plan.id),
                    str(plan.device_id),
                    "DRAFT",
                    plan.model_dump_json(),
                    plan.digest(),
                    now,
                    now,
                    None,
                    None,
                ),
            )
        return self.get(str(plan.id))

    @staticmethod
    def task(row: sqlite3.Row) -> dict[str, Any]:
        plan = parse_computer_plan(json.loads(row["plan"]))
        return {
            "id": row["id"],
            "device_id": row["device_id"],
            "status": row["status"],
            "plan": plan.model_dump(mode="json"),
            "digest": row["digest"],
            "steps": plan.steps(),
            "created_at": row["created"],
            "updated_at": row["updated"],
            "result": json.loads(row["result"]) if row["result"] else None,
        }

    def get(self, id: str) -> dict[str, Any]:
        with self.connection() as db:
            row = db.execute("SELECT * FROM computer_tasks WHERE id=?", (id,)).fetchone()
            if row is None:
                raise ValueError("Computer task not found")
            return self.task(row)

    def tasks(self) -> list[dict[str, Any]]:
        with self.connection() as db:
            db.execute(
                "UPDATE computer_tasks SET status='INTERRUPTED',updated=? WHERE "
                "status='RUNNING' AND updated < ?",
                (time.time(), time.time() - 120),
            )
            return [
                self.task(row)
                for row in db.execute(
                    "SELECT * FROM computer_tasks ORDER BY created DESC LIMIT 100"
                )
            ]

    def approve(self, id: str, digest: str) -> dict[str, Any]:
        with self.connection() as db:
            row = db.execute("SELECT plan FROM computer_tasks WHERE id=?", (id,)).fetchone()
            if not row:
                raise ValueError("Computer task not found")
            self.check_application(db, parse_computer_plan(json.loads(row["plan"])))
            changed = db.execute(
                "UPDATE computer_tasks SET status='QUEUED',updated=? WHERE id=? AND "
                "status='DRAFT' AND digest=? AND EXISTS (SELECT 1 FROM devices WHERE "
                "devices.id=computer_tasks.device_id AND revoked=0 AND last_seen>?)",
                (time.time(), id, digest, time.time() - 30),
            ).rowcount
            if changed != 1:
                raise ValueError(
                    "Review the current manifest and reconnect the device before approval"
                )
        return self.get(id)

    def cancel(self, id: str) -> dict[str, Any]:
        with self.connection() as db:
            db.execute(
                "UPDATE computer_tasks SET status='CANCELLED',updated=? WHERE id=? AND "
                "status IN ('DRAFT','QUEUED','RUNNING')",
                (time.time(), id),
            )
        return self.get(id)

    def claim(self, device_id: str) -> dict[str, Any] | None:
        with self.connection() as db:
            if (
                db.execute(
                    "UPDATE devices SET last_seen=? WHERE id=? AND revoked=0",
                    (time.time(), device_id),
                ).rowcount
                != 1
            ):
                raise ValueError("Device is revoked or unknown")
            self.cancel_invalid_applications(db, device_id)
            db.execute(
                "UPDATE computer_tasks SET status='INTERRUPTED',updated=? WHERE "
                "device_id=? AND status='RUNNING' AND updated < ?",
                (time.time(), device_id, time.time() - 120),
            )
            if db.execute(
                "SELECT 1 FROM computer_tasks WHERE device_id=? AND status='RUNNING'", (device_id,)
            ).fetchone():
                return None
            row = db.execute(
                "SELECT * FROM computer_tasks WHERE device_id=? AND status='QUEUED' "
                "ORDER BY created LIMIT 1",
                (device_id,),
            ).fetchone()
            if row is None:
                return None
            claim = secrets.token_urlsafe(24)
            db.execute(
                "UPDATE computer_tasks SET status='RUNNING',updated=?,claim=? WHERE id=?",
                (time.time(), claim, row["id"]),
            )
            result = self.task(row)
            result.update(status="RUNNING", claim=claim)
            return result

    def agent_state(self, device: str, id: str) -> dict[str, Any]:
        task = self.get(id)
        if task["device_id"] != device:
            raise ValueError("Task belongs to another device")
        with self.connection() as db:
            self.check_application(db, parse_computer_plan(task["plan"]))
        return {"status": task["status"], "digest": task["digest"]}

    def progress(self, device: str, id: str, claim: str, steps: list[dict[str, Any]]) -> None:
        with self.connection() as db:
            row = db.execute(
                "SELECT result FROM computer_tasks WHERE id=? AND device_id=? AND "
                "claim=? AND status='RUNNING'",
                (id, device, claim),
            ).fetchone()
            if row is None:
                raise ValueError("Task is no longer running under this claim")
            old = json.loads(row["result"])["steps"] if row["result"] else []
            if len(steps) < len(old) or steps[: len(old)] != old:
                raise ValueError("Recorded step receipts cannot be replaced")
            db.execute(
                "UPDATE computer_tasks SET updated=?,result=? WHERE id=?",
                (time.time(), json.dumps({"ok": False, "running": True, "steps": steps}), id),
            )

    def receipt(self, device: str, id: str, claim: str, result: dict[str, Any]) -> dict[str, Any]:
        with self.connection() as db:
            row = db.execute(
                "SELECT * FROM computer_tasks WHERE id=? AND device_id=? AND claim=?",
                (id, device, claim),
            ).fetchone()
            if row is None:
                raise ValueError("Execution claim does not match")
            if row["status"] in {"COMPLETED", "FAILED"}:
                return self.task(row)
            if row["status"] not in {"RUNNING", "CANCELLED"}:
                raise ValueError("Execution was interrupted; do not replay it")
            status = (
                "CANCELLED"
                if row["status"] == "CANCELLED"
                else "COMPLETED"
                if result.get("ok")
                else "FAILED"
            )
            db.execute(
                "UPDATE computer_tasks SET status=?,updated=?,result=? WHERE id=?",
                (status, time.time(), json.dumps(result), id),
            )
        return self.get(id)
