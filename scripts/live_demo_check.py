"""Run INTI-DEMO-001 against a running INTI stack and record real evidence.

This script never fabricates a plan, a browser action or a verdict. It uses the
authored sandbox recipe (explicitly labelled as authored), real Chromium actions
and the independent read-only verifier. Live Meta recovery is a separate,
explicitly gated path and is not claimed by this check.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "docs" / "evidence" / "phase7-live-demo.json"
OBJECTIVE = "Find asset PC-104, change its status to Operational, and verify the persisted result."


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def operator_token() -> str:
    token = os.environ.get("EXECUTION_OPERATOR_TOKEN") or read_env(ROOT / ".env").get(
        "EXECUTION_OPERATOR_TOKEN", ""
    )
    if len(token) < 24:
        raise SystemExit(
            "EXECUTION_OPERATOR_TOKEN is missing or too short; configure .env first"
        )
    return token


def request(
    client: httpx.Client,
    method: str,
    path: str,
    token: str,
    payload: dict[str, Any] | None = None,
) -> httpx.Response:
    response = client.request(
        method,
        path,
        json=payload,
        headers={"Authorization": "Bearer " + token},
        timeout=30,
    )
    return response


def require(response: httpx.Response, expected: int, label: str) -> dict[str, Any]:
    if response.status_code != expected:
        raise SystemExit(
            f"{label} failed: HTTP {response.status_code} {response.text[:500]}"
        )
    data = response.json()
    if not isinstance(data, dict):
        raise SystemExit(f"{label} returned a non-object response")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api", default=os.environ.get("INTI_API_URL", "http://127.0.0.1:8000")
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--arm-fault",
        action="store_true",
        help="Attempt the live rename/relocate fault. Requires enabled Meta recovery access.",
    )
    args = parser.parse_args()
    token = operator_token()
    recorded_at = datetime.now(UTC).isoformat()
    report: dict[str, Any] = {
        "scenario": "INTI-DEMO-001",
        "recorded_at": recorded_at,
        "api": args.api,
        "objective": OBJECTIVE,
        "mode": "authored_demo",
        "plan_source": "explicit authored sandbox recipe; no model reasoning",
        "live_model_recovery_claimed": False,
    }
    with httpx.Client(base_url=args.api, follow_redirects=False) as client:
        health = require(request(client, "GET", "/api/v1/health", token), 200, "health")
        capabilities = require(
            request(client, "GET", "/api/v1/capabilities", token), 200, "capabilities"
        )
        report["backend"] = {
            "version": health.get("version"),
            "capabilities": capabilities,
        }
        if args.arm_fault and not all(
            capabilities.get(key)
            for key in ("model_calls_enabled", "model_configured", "recovery_enabled")
        ):
            report.update(
                ok=False,
                status="BLOCKED",
                blocker="LIVE_RECOVERY_BLOCKED",
                fault={"requested": True, "armed": False},
                message="Live recovery requires enabled Meta access; no reset or substitute run was performed.",
            )
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(
                json.dumps(report, indent=2) + "\n", encoding="utf-8"
            )
            print(
                json.dumps(
                    {"ok": False, "status": "BLOCKED", "output": str(args.output)},
                    indent=2,
                )
            )
            return 2
        report["meta_dependency"] = {"checked": False}
        if not capabilities.get("model_calls_enabled"):
            meta_mission = require(
                request(
                    client,
                    "POST",
                    "/api/v1/missions",
                    token,
                    {
                        "objective": OBJECTIVE,
                        "mode": "meta",
                        "target_application": "inventory",
                    },
                ),
                201,
                "meta mission create",
            )
            meta_prepare = request(
                client,
                "POST",
                f"/api/v1/missions/{meta_mission['id']}/prepare",
                token,
                {},
            )
            if meta_prepare.status_code != 409:
                raise SystemExit(
                    "Meta planning did not fail explicitly while model calls are disabled: "
                    f"HTTP {meta_prepare.status_code}"
                )
            error = meta_prepare.json().get("error", {})
            if error.get("code") != "MODEL_CALLS_DISABLED":
                raise SystemExit(f"Unexpected Meta dependency error: {error}")
            report["meta_dependency"] = {
                "checked": True,
                "http_status": meta_prepare.status_code,
                "error_code": error.get("code"),
                "message": error.get("message"),
                "mission_id": meta_mission["id"],
            }
        if not capabilities.get("execution_enabled"):
            raise SystemExit("Execution is disabled; enable EXECUTION_ENABLED=true")
        if not capabilities.get("verification_enabled"):
            raise SystemExit("Independent verification is disabled")
        if not capabilities.get("demo_controls_enabled"):
            raise SystemExit(
                "Demo controls are disabled; run scripts/start_demo.ps1 first"
            )

        state = require(
            request(client, "GET", "/api/v1/demo/status", token), 200, "demo status"
        )
        if state.get("synthetic") is not True:
            raise SystemExit(
                "The demo controller is not backed by a marked synthetic store"
            )
        store_id = state["store_id"]
        reset = require(
            request(
                client,
                "POST",
                "/api/v1/demo/reset",
                token,
                {"store_id": store_id, "confirmation": "RESET PC-104"},
            ),
            200,
            "demo reset",
        )
        if reset.get("asset", {}).get("status") != "Inactive":
            raise SystemExit("Reset did not establish PC-104 = Inactive")
        report["reset"] = {
            "store_id": store_id,
            "synthetic": reset.get("synthetic"),
            "asset": reset.get("asset"),
            "faults_active": reset.get("faults_active"),
        }

        mission = require(
            request(
                client,
                "POST",
                "/api/v1/missions",
                token,
                {
                    "objective": OBJECTIVE,
                    "mode": "authored_demo",
                    "target_application": "inventory",
                },
            ),
            201,
            "mission create",
        )
        mission_id = mission["id"]
        prepared = require(
            request(
                client, "POST", f"/api/v1/missions/{mission_id}/prepare", token, {}
            ),
            200,
            "mission prepare",
        )
        detail = require(
            request(client, "GET", f"/api/v1/missions/{mission_id}", token),
            200,
            "mission detail",
        )
        execution = detail.get("execution")
        if not prepared.get("plan_id") or not execution:
            raise SystemExit("Preparation did not produce a plan and execution bundle")
        if detail["plan"]["plan"]["task_id"] != mission_id:
            raise SystemExit("Plan identity does not match the mission")
        if execution["session"]["task_id"] != mission_id:
            raise SystemExit("Execution identity does not match the mission")
        report["mission"] = {
            "id": mission_id,
            "plan_id": prepared["plan_id"],
            "execution_id": execution["session"]["id"],
            "observation_id": prepared.get("observation_id"),
            "plan_actions": len(execution["manifest"]["actions"]),
        }

        base = "/api/v1/executions/" + execution["session"]["id"]
        digest = execution["manifest"]["digest"]
        high_risk = [
            action["id"]
            for action in execution["manifest"]["actions"]
            if action["risk_level"] == "HIGH"
        ]
        require(
            request(
                client,
                "POST",
                base + "/approve",
                token,
                {"manifest_digest": digest, "scope": "plan"},
            ),
            200,
            "plan approval",
        )
        require(
            request(
                client,
                "POST",
                base + "/approve",
                token,
                {
                    "manifest_digest": digest,
                    "scope": "high_risk",
                    "action_ids": high_risk,
                },
            ),
            200,
            "high-risk approval",
        )
        report["authorization"] = {
            "plan_approved": True,
            "high_risk_action_ids": high_risk,
        }

        fault_result: dict[str, Any] = {"requested": args.arm_fault, "armed": False}
        if args.arm_fault:
            armed = request(
                client, "POST", f"/api/v1/missions/{mission_id}/demo-fault", token, {}
            )
            fault_result["http_status"] = armed.status_code
            if armed.status_code == 200:
                fault_result["armed"] = True
            else:
                fault_result["error"] = armed.json().get("error", {})
                report.update(ok=False, status="BLOCKED", fault=fault_result)
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(
                    json.dumps(report, indent=2) + "\n", encoding="utf-8"
                )
                return 2
        report["fault"] = fault_result

        require(
            request(client, "POST", base + "/start", token, {}), 202, "execution start"
        )

        deadline = time.monotonic() + 180
        final: dict[str, Any] | None = None
        while time.monotonic() < deadline:
            current = require(
                request(client, "GET", f"/api/v1/missions/{mission_id}", token),
                200,
                "mission poll",
            )
            if (current.get("verification_report") or {}).get("effective_verdict"):
                final = current
                break
            status = (current.get("execution") or {}).get("session", {}).get("status")
            if status in {"FAILED", "CANCELLED", "TIMED_OUT"}:
                raise SystemExit(f"Execution ended without verification: {status}")
            time.sleep(0.5)
        if final is None:
            raise SystemExit(
                "Mission did not reach independent verification within 180 seconds"
            )

        verification = final["verification_report"]
        if verification["effective_verdict"] != "VERIFIED_SUCCESS":
            raise SystemExit(
                "Independent verification did not return VERIFIED_SUCCESS: "
                + str(verification["effective_verdict"])
            )
        report["execution"] = {
            "status": final["execution"]["session"]["status"],
            "results": [
                {
                    "action_id": result["action_id"],
                    "status": result["status"],
                    "duration_ms": result["duration_ms"],
                }
                for result in final["execution"]["results"]
            ],
        }
        report["verification"] = {
            "id": final["verifications"][0]["session"]["id"],
            "effective_verdict": verification["effective_verdict"],
            "declared_overall_goal_verified": verification["execution_summary"][
                "declared_overall_goal_verified"
            ],
            "evidence_count": len(final["verifications"][0]["evidence"]),
            "criteria_results": final["verifications"][0]["session"][
                "criteria_results"
            ],
            "integrity_checks": verification["integrity_checks"],
        }
        if final.get("recoveries"):
            report["recovery"] = [
                {
                    "id": bundle["session"]["id"],
                    "status": bundle["session"]["status"],
                    "attempts": bundle["session"]["attempts_count"],
                    "model_calls": bundle["session"]["model_calls"],
                }
                for bundle in final["recoveries"]
            ]
            if args.arm_fault:
                report["live_model_recovery_claimed"] = bool(
                    final["mission"]["fault_injected"]
                ) and any(
                    r["session"]["status"] == "RECOVERED" for r in final["recoveries"]
                )
        if args.arm_fault and not report["live_model_recovery_claimed"]:
            raise SystemExit(
                "Requested fault recovery was not confirmed; the demo did not pass"
            )
        if not final.get("recoveries"):
            report["recovery"] = "No recovery was triggered in the authored path."

        persisted = require(
            request(client, "GET", "/api/v1/demo/status", token), 200, "persisted state"
        )
        report["persisted_asset"] = persisted.get("asset")
        if persisted.get("asset", {}).get("status") != "Operational":
            raise SystemExit(
                "Persisted PC-104 status is not Operational after verification"
            )

        benchmarks = require(
            request(client, "GET", "/api/v1/benchmarks", token), 200, "benchmarks"
        )
        verification_report = next(
            (
                item
                for item in benchmarks.get("items", [])
                if item["report_id"] == "verification"
            ),
            None,
        )
        report["benchmark"] = (
            {
                "report_id": verification_report["report_id"],
                "sha256": verification_report["sha256"],
                "scenarios": verification_report["data"].get("scenarios"),
                "verdict_accuracy": verification_report["data"].get("verdict_accuracy"),
            }
            if verification_report
            else "No measured benchmark report available"
        )
        report["limitations"] = [
            "The authored recipe is not Meta-generated planning.",
            "The default authored path makes no model calls; --arm-fault requires live Meta recovery.",
            "The rename/relocate recovery path remains gated on configured Meta recovery access.",
        ]
        report.update(ok=True, status="PASSED")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"ok": True, "output": str(args.output), **report}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
