"""Deterministic test-only fault control; admin capability is never sent to the UI."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import re
import secrets
import threading
from contextlib import closing
import sqlite3
from uuid import UUID
from pathlib import Path

DEFAULTS = {"move_save":False,"save_label":None,"modal":False,"render_delay_ms":0,
    "disable_control_ms":0,"reorder_fields":False,"reorder_columns":False,
    "navigation_path":None,"duplicate_save":False,"reject_updates":False,
    "optimistic_only":False,"optimistic_on_reject":False,"mutation_target_override":None,"seed":42}


class FaultController:
    def __init__(self):
        self.lock = threading.Lock()
        self.version = 0
        self.values = dict(DEFAULTS)
        self.reset_generation = 0

    def configure(self,values):
        if not isinstance(values,dict) or set(values)-set(DEFAULTS):
            raise ValueError("Unsupported bounded sandbox fault")
        candidate = {**DEFAULTS,**values}
        for key,value in candidate.items():
            default = DEFAULTS[key]
            if type(default) is bool and type(value) is not bool:
                raise ValueError("Invalid boolean fault")
            if key in {"render_delay_ms","disable_control_ms"} and (type(value) is not int or not 0<=value<=10000):
                raise ValueError("Invalid bounded UI delay")
        if type(candidate["seed"]) is not int or not 0<=candidate["seed"]<=100000:
            raise ValueError("Invalid deterministic fault seed")
        if candidate["save_label"] is not None and (not isinstance(candidate["save_label"],str) or not 1<=len(candidate["save_label"])<=80):
            raise ValueError("Invalid visible label")
        if candidate["navigation_path"] not in {None,"/inventory"}:
            raise ValueError("Only the local inventory alias can be injected")
        target = candidate["mutation_target_override"]
        if target is not None and (not isinstance(target,str) or not re.fullmatch(r"[A-Z]{1,8}-[0-9]{1,8}",target)):
            raise ValueError("Invalid synthetic target override")
        with self.lock:
            self.values = candidate
            self.version += 1

    def current(self):
        with self.lock:
            return {**self.values,"version":self.version,"reset_generation":self.reset_generation}

    def visible_state(self):
        # Only presentation behavior needed by the application. No admin token or mutation routing.
        values = self.current()
        return {key:value for key,value in values.items() if key not in {"reject_updates","mutation_target_override"}}


def create_fault_server(host,port,controller,token,database=None):
    if len(token)<24:
        raise ValueError("Fault injection requires a separate admin capability")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):
            pass

        def reply(self,status,body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type","application/json")
            self.send_header("Content-Length",str(len(data)))
            self.send_header("Cache-Control","no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == '/state' and self.authorized() and database:
                try:
                    return self.reply(200,self.demo_state())
                except (sqlite3.Error,ValueError):
                    return self.reply(503,{'error':'Synthetic store unavailable'})
            self.reply(405,{"error":"Fault configuration is not a public inspection interface"})

        def authorized(self):
            return secrets.compare_digest(self.headers.get('Authorization','').encode(),('Bearer '+token).encode())

        def demo_state(self):
            with closing(sqlite3.connect(Path(database).resolve().as_uri()+'?mode=ro',uri=True)) as connection:
                connection.row_factory = sqlite3.Row
                meta = dict(connection.execute('SELECT key,value FROM application_metadata').fetchall())
                if meta.get('synthetic') != 'inti.inventory.demo.v1':
                    raise ValueError('Only a marked synthetic store may be reset')
                row = connection.execute("SELECT id,name,location,status,version FROM assets WHERE id='PC-104'").fetchone()
            return {'store_id':str(UUID(meta['store_id'])),'synthetic':True,'asset':dict(row),
                'faults_active':any(v != DEFAULTS[k] for k,v in controller.current().items() if k in DEFAULTS)}

        def do_POST(self):
            supplied = self.headers.get("Authorization","")
            if not secrets.compare_digest(supplied.encode(),("Bearer "+token).encode()):
                return self.reply(401,{"error":"Fault admin capability required"})
            if self.path not in {"/faults","/reset"}:
                return self.reply(404,{"error":"Not found"})
            try:
                size = int(self.headers.get("Content-Length","0"))
                if not 0<size<=4096:
                    raise ValueError()
                payload = json.loads(self.rfile.read(size))
                if self.path == '/reset':
                    if not database or set(payload) != {'store_id','confirmation'} or payload['confirmation'] != 'RESET PC-104':
                        raise ValueError()
                    state = self.demo_state()
                    if payload['store_id'] != state['store_id']:
                        return self.reply(409,{'error':'Synthetic store identity changed'})
                    with closing(sqlite3.connect(database)) as connection,connection:
                        connection.execute("UPDATE assets SET status='Inactive',version=version+1 WHERE id='PC-104'")
                    controller.configure({})
                    with controller.lock:
                        controller.reset_generation += 1
                    return self.reply(200,self.demo_state())
                controller.configure(payload)
                self.reply(200,{"configured":True,"version":controller.current()["version"]})
            except (ValueError,TypeError,KeyError,sqlite3.Error):
                self.reply(422,{"error":"Invalid deterministic sandbox fault"})

    return ThreadingHTTPServer((host,port),Handler)
