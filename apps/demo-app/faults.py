"""Deterministic test-only fault control; admin capability is never sent to the UI."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import re
import secrets
import threading

DEFAULTS = {"move_save":False,"save_label":None,"modal":False,"render_delay_ms":0,
    "disable_control_ms":0,"reorder_fields":False,"reorder_columns":False,
    "navigation_path":None,"duplicate_save":False,"reject_updates":False,
    "optimistic_only":False,"optimistic_on_reject":False,"mutation_target_override":None,"seed":42}


class FaultController:
    def __init__(self):
        self.lock = threading.Lock()
        self.version = 0
        self.values = dict(DEFAULTS)

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
            return {**self.values,"version":self.version}

    def visible_state(self):
        # Only presentation behavior needed by the application. No admin token or mutation routing.
        values = self.current()
        return {key:value for key,value in values.items() if key not in {"reject_updates","mutation_target_override"}}


def create_fault_server(host,port,controller,token):
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
            self.reply(405,{"error":"Fault configuration is not a public inspection interface"})

        def do_POST(self):
            supplied = self.headers.get("Authorization","")
            if not secrets.compare_digest(supplied.encode(),("Bearer "+token).encode()):
                return self.reply(401,{"error":"Fault admin capability required"})
            if self.path != "/faults":
                return self.reply(404,{"error":"Not found"})
            try:
                size = int(self.headers.get("Content-Length","0"))
                if not 0<size<=4096:
                    raise ValueError()
                controller.configure(json.loads(self.rfile.read(size)))
                self.reply(200,{"configured":True,"version":controller.current()["version"]})
            except (ValueError,TypeError):
                self.reply(422,{"error":"Invalid deterministic sandbox fault"})

    return ThreadingHTTPServer((host,port),Handler)
