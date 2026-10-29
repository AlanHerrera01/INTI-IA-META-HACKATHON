"""Synthetic inventory sandbox with a real SQLite data store. No destructive API."""
import argparse
from contextlib import closing
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sqlite3
from uuid import uuid4
import os
import threading
from faults import FaultController, create_fault_server

ROOT = Path(__file__).resolve().parent / "src"
STATUSES = {"Available", "In use", "Maintenance", "Inactive", "Operational"}
SAMPLE = [("EQ-001", "Andes Workstation", "Quito Lab", "Available"),
          ("EQ-002", "Solar Camera", "Cuenca Lab", "In use"),
          ("EQ-003", "Field Sensor Kit", "Loja Lab", "Maintenance"),
          ("EQ-004", "Network Switch", "Quito Lab", "Available"),
          ("PC-104", "Accounting Workstation", "Quito Lab", "Inactive"),
          ("PC-105", "Engineering Workstation", "Quito Lab", "Inactive")]


def create_server(host: str, port: int, database: Path, faults: FaultController | None=None) -> ThreadingHTTPServer:
    faults = faults or FaultController()
    database.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute("CREATE TABLE IF NOT EXISTS application_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        connection.execute("INSERT OR IGNORE INTO application_metadata(key,value) VALUES ('store_id',?)",(str(uuid4()),))
        connection.execute("CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)")
        connection.executemany("INSERT OR IGNORE INTO assets(id,name,location,status) VALUES (?,?,?,?)", SAMPLE)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def end_headers(self):
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")
            super().end_headers()

        def reply(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/api/ui-state":
                self.reply(200,faults.visible_state())
            elif self.path == "/api/inventory":
                with closing(sqlite3.connect(database)) as connection, connection:
                    connection.row_factory = sqlite3.Row
                    rows = [dict(row) for row in connection.execute("SELECT * FROM assets ORDER BY id")]
                self.reply(200, rows)
            else:
                if self.path == "/inventory":
                    self.path = "/"
                super().do_GET()

        def do_POST(self):
            if self.path != "/api/inventory":
                return self.reply(404, {"error": "Not found"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 10000:
                    raise ValueError()
                body = json.loads(self.rfile.read(size))
                if set(body) != {"id", "name", "location", "status", "version"}:
                    raise ValueError()
                if (body["status"] not in STATUSES or not isinstance(body["version"], int)
                        or any(not isinstance(body[key], str) or not 1 <= len(body[key]) <= 150
                               for key in ("id", "name", "location"))):
                    raise ValueError()
                injected = faults.current()
                if injected["reject_updates"]:
                    return self.reply(409,{"error":"Synthetic backend rejection; no update persisted"})
                target_id = injected["mutation_target_override"] or body["id"]
                with closing(sqlite3.connect(database)) as connection, connection:
                    if target_id != body["id"]:
                        cursor = connection.execute("UPDATE assets SET status=?,version=version+1 WHERE id=? AND version=?",
                            (body["status"],target_id,body["version"]))
                    else:
                        cursor = connection.execute("UPDATE assets SET name=?,location=?,status=?,version=version+1 WHERE id=? AND version=?",
                            (body["name"], body["location"], body["status"], body["id"], body["version"]))
                    if cursor.rowcount != 1:
                        return self.reply(409, {"error": "Record changed; reload before saving"})
                self.reply(200, {**body, "version": body["version"] + 1})
            except (ValueError, TypeError, KeyError):
                self.reply(422, {"error": "Invalid synthetic asset record"})

    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--db", type=Path, default=Path("data/inventory.db"))
    parser.add_argument("--fault-host",default="127.0.0.1")
    parser.add_argument("--fault-port",type=int,default=8002)
    args = parser.parse_args()
    controller = FaultController()
    admin_token = os.environ.get("DEMO_FAULT_CONTROL_TOKEN","")
    if admin_token:
        admin = create_fault_server(args.fault_host,args.fault_port,controller,admin_token)
        threading.Thread(target=admin.serve_forever,daemon=True).start()
    create_server(args.host, args.port, args.db,controller).serve_forever()
