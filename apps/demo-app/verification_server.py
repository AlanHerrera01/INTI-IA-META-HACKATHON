"""Private read-only inventory gateway. Mount the application database read-only."""
import argparse
from contextlib import closing
from datetime import UTC, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
from urllib.parse import urlsplit
from uuid import UUID

ROOT = Path(__file__).resolve().parent / "verification"


def snapshot(database: Path,request: dict) -> dict:
    # A fresh OS-enforced read-only connection for every capture; SQL is fixed.
    with closing(sqlite3.connect(database.resolve().as_uri()+"?mode=ro",uri=True)) as connection:
        connection.execute("PRAGMA query_only=ON")
        connection.execute("BEGIN")
        connection.row_factory = sqlite3.Row
        store = connection.execute("SELECT value FROM application_metadata WHERE key='store_id'").fetchone()
        rows = [dict(row) for row in connection.execute("SELECT id,name,location,status,version FROM assets ORDER BY id LIMIT 1001")]
    if not store or len(rows)>1000:
        raise ValueError("Invalid bounded application snapshot")
    return {"request":request,"captured_at":datetime.now(UTC).isoformat(),
            "source_system":"inti.inventory.readonly.sqlite.v1","store_id":store[0],
            "records":rows,"read_only":True}


def create_verification_server(host: str,port: int,database: Path,token: str) -> ThreadingHTTPServer:
    if token and len(token)<24:
        raise ValueError("Read-only capability must contain at least 24 characters")

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):
            super().__init__(*args,directory=str(ROOT),**kwargs)

        def log_message(self,*args):
            pass  # No capabilities, correlation IDs or record contents in access logs.

        def end_headers(self):
            self.send_header("Cache-Control","no-store")
            self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("Content-Security-Policy","default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'")
            super().end_headers()

        def reply(self,status,body):
            data = json.dumps(body,separators=(",",":"),sort_keys=True).encode()
            self.send_response(status)
            self.send_header("Content-Type","application/json")
            self.send_header("Content-Length",str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def request_context(self):
            names = {"collection_id":"X-Collection-ID","execution_id":"X-Execution-ID", "task_id":"X-Task-ID","nonce":"X-Evidence-Nonce"}
            context = {key:str(UUID(self.headers[header])) for key,header in names.items()}
            record = self.headers.get("X-Record-ID","")
            if not re.fullmatch(r"[A-Z]{1,8}-[0-9]{1,8}",record):
                raise ValueError("Invalid record")
            return {**context,"record_id":record}

        def do_GET(self):
            path = urlsplit(self.path)
            if path.path == "/health":
                return self.reply(200,{"configured":bool(token),"database_present":database.is_file()})
            supplied = self.headers.get("Authorization","")
            if not token or not secrets.compare_digest(supplied.encode(),("Bearer "+token).encode()):
                return self.reply(401,{"error":"Read-only capability required"})
            if path.query or path.fragment:
                return self.reply(400,{"error":"Query inspection is not supported"})
            try:
                if path.path == "/verification/v1/snapshot":
                    return self.reply(200,snapshot(database,self.request_context()))
                if path.path == "/api/inventory":
                    return self.reply(200,snapshot(database,{})["records"])
                if path.path not in {"/","/readonly.js"}:
                    return self.reply(404,{"error":"Not found"})
                super().do_GET()
            except (ValueError,KeyError,TypeError):
                self.reply(422,{"error":"Invalid read-only evidence request"})
            except sqlite3.Error:
                self.reply(503,{"error":"Read-only application state unavailable"})

        def reject_write(self):
            # Drain only a bounded body so Windows does not reset the socket before
            # the denial reaches the client. No data is parsed or persisted.
            self.connection.settimeout(1)
            try:
                size = int(self.headers.get("Content-Length","0"))
                if 0 < size <= 4096:
                    self.rfile.read(size)
            except (ValueError,TimeoutError,OSError):
                pass
            self.close_connection = True
            self.reply(405,{"error":"This identity and endpoint are read-only"})

        do_POST = reject_write
        do_PUT = reject_write
        do_PATCH = reject_write
        do_DELETE = reject_write

        def do_HEAD(self):
            self.reply(405,{"error":"Use an authenticated read-only GET"})

    return ThreadingHTTPServer((host,port),Handler)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host",default="127.0.0.1")
    parser.add_argument("--port",type=int,default=8003)
    parser.add_argument("--db",type=Path,default=Path("data/inventory.db"))
    args = parser.parse_args()
    create_verification_server(args.host,args.port,args.db,os.environ.get("VERIFICATION_READ_TOKEN","")).serve_forever()
