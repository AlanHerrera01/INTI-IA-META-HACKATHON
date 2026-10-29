"""Opt-in sandbox execution verification. Never resets existing application data."""

import argparse
import asyncio
import json
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
from inti.infrastructure.config import ConfigurationProvider
from playwright.async_api import async_playwright


async def verify(output: Path, run_sandbox: bool) -> None:
    settings = ConfigurationProvider()
    token = settings.execution_operator_token.get_secret_value()
    headers = {"Authorization": "Bearer " + token}
    async with httpx.AsyncClient(
        base_url="http://127.0.0.1:8000", headers=headers, timeout=60
    ) as api:

        async def request(method: str, path: str, payload: dict | None = None) -> dict:
            response = await api.request(method, path, json=payload)
            response.raise_for_status()
            return response.json()

        async with httpx.AsyncClient() as demo:
            rows = (await demo.get("http://127.0.0.1:8001/api/inventory")).json()
        initial = next(row for row in rows if row["id"] == "PC-104")
        if run_sandbox:
            if initial["status"] != "Inactive":
                raise RuntimeError(
                    "PC-104 must be Inactive. Existing data was preserved; use a fresh demo database or edit it explicitly."
                )
            bundle = await request("POST", "/api/v1/executions/demo/prepare")
            base = "/api/v1/executions/" + bundle["session"]["id"]
            payload = {"manifest_digest": bundle["manifest"]["digest"], "scope": "plan"}
            await request("POST", base + "/approve", payload)
            payload.update(
                scope="high_risk",
                action_ids=[
                    a["id"]
                    for a in bundle["manifest"]["actions"]
                    if a["risk_level"] == "HIGH"
                ],
            )
            await request("POST", base + "/approve", payload)
            await request("POST", base + "/start")
            await request("POST", base + "/pause")
            for _ in range(200):
                bundle = await request("GET", base)
                if bundle["session"]["status"] == "PAUSED":
                    break
                if bundle["session"]["status"] in {"FAILED", "TIMED_OUT", "CANCELLED"}:
                    raise RuntimeError(str(bundle["session"]))
                await asyncio.sleep(0.1)
            assert bundle["session"]["status"] == "PAUSED"
            await request("POST", base + "/resume")
            for _ in range(600):
                bundle = await request("GET", base)
                if (
                    bundle["session"]["status"]
                    in {"COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED"}
                    and (bundle["browser_session"] or {}).get("status") == "CLOSED"
                ):
                    break
                await asyncio.sleep(0.1)
        else:
            history = await request("GET", "/api/v1/executions")
            bundle = next(
                item
                for item in history["items"]
                if item["session"]["status"] == "COMPLETED"
            )
            base = "/api/v1/executions/" + bundle["session"]["id"]
        assert bundle["session"]["status"] == "COMPLETED", bundle["session"]
        events_response = await api.get(base + "/events")
        events_response.raise_for_status()
        events = events_response.json()
        evidence = bundle["session"]["latest_observation_id"]
        assert (
            await api.get(f"/api/v1/observations/{evidence}/screenshot")
        ).content.startswith(b"\x89PNG")
        async with httpx.AsyncClient() as public:
            assert (
                await public.get(
                    f"http://127.0.0.1:8000/api/v1/observations/{evidence}/screenshot"
                )
            ).status_code == 401
            rows = (await public.get("http://127.0.0.1:8001/api/inventory")).json()
        actual = next(row for row in rows if row["id"] == "PC-104")
        assert actual["status"] == "Operational"
        output.parent.mkdir(parents=True, exist_ok=True)
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            await page.goto("http://127.0.0.1:8001/", wait_until="networkidle")
            assert (
                await page.get_by_label("PC-104 table status", exact=True).input_value()
                == "Operational"
            )
            await page.goto("http://127.0.0.1:5173/execution", wait_until="networkidle")
            await page.get_by_label("Operator token").fill(token)
            await page.get_by_role("button", name="Connect", exact=True).click()
            await page.get_by_role(
                "button", name="COMPLETED", exact=False
            ).first.click()
            await page.get_by_alt_text(
                "Latest execution browser observation"
            ).wait_for()
            await page.get_by_text("Saved event history", exact=True).wait_for()
            # Clear the token input before capturing the UI; capability remains only in memory.
            await page.get_by_label("Operator token").fill("")
            await page.screenshot(path=str(output.with_suffix(".png")), full_page=True)
            await page.set_viewport_size({"width": 390, "height": 844})
            await page.screenshot(
                path=str(output.with_name(output.stem + "-mobile.png")), full_page=True
            )
            await browser.close()
        results = bundle["results"]
        start, end = bundle["session"]["started_at"], bundle["session"]["completed_at"]
        report = {
            "recorded_at": datetime.now(UTC).isoformat(),
            "execution_id": bundle["session"]["id"],
            "plan_id": bundle["session"]["plan_id"],
            "manifest_digest": bundle["manifest"]["digest"],
            "status": bundle["session"]["status"],
            "grounding_mode": bundle["manifest"]["grounding_mode"],
            "planned_actions": len(bundle["manifest"]["actions"]),
            "executed_actions": sum(r["action_executed"] for r in results),
            "successful_actions": sum(r["status"] == "SUCCEEDED" for r in results),
            "failed_actions": sum(r["status"] == "FAILED" for r in results),
            "target_resolution_failures": sum(
                r["error_code"] in {"TARGET_UNRESOLVED", "TARGET_AMBIGUOUS"}
                for r in results
            ),
            "authorization_rejections": sum(
                e["event_type"] == "authorization_rejected" for e in events
            ),
            "authorization_rejection_scope": "This completed run only; denied paths tested separately",
            "browser_session_failures": sum(
                e["event_type"] == "execution_failed" for e in events
            ),
            "postcondition_pass_rate": sum(
                r["postconditions_satisfied"] is True for r in results
            )
            / len(results),
            "duration_seconds": (
                datetime.fromisoformat(end) - datetime.fromisoformat(start)
            ).total_seconds(),
            "events": len(events),
            "evidence_references": [
                {
                    "before": r["before_observation_id"],
                    "after": r["after_observation_id"],
                }
                for r in results
            ],
            "pause_resume_verified": {"execution_paused", "execution_resumed"}
            <= {e["event_type"] for e in events},
            "application_store_status": actual["status"],
            "application_store_version": actual["version"],
            "fresh_browser_reload_verified": True,
            "ui_evidence_and_event_stream_verified": True,
            "engine_overall_goal_verified": bundle["session"]["overall_goal_verified"],
            "model_calls": 0,
            "plan_provenance": "Explicit authored sandbox recipe; no Meta inference",
        }
        if run_sandbox:
            cancelled = await request("POST", "/api/v1/executions/demo/prepare")
            tick = time.perf_counter()
            cancelled = await request(
                "POST", "/api/v1/executions/" + cancelled["session"]["id"] + "/cancel"
            )
            report["cancellation_response_ms"] = (time.perf_counter() - tick) * 1000
            report["cancellation_status"] = cancelled["session"]["status"]
            report["cancellation_scope"] = (
                "Unstarted AWAITING_APPROVAL session; live cancellation covered by automated test"
            )
        output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(
            json.dumps(
                {
                    key: report[key]
                    for key in (
                        "execution_id",
                        "status",
                        "executed_actions",
                        "postcondition_pass_rate",
                        "application_store_status",
                    )
                }
            )
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--run-sandbox",
        action="store_true",
        help="Approve the exact authored sandbox plan and separate HIGH save, then run PC-104 through the UI",
    )
    parser.add_argument(
        "--output", type=Path, default=Path("artifacts/phase3/execution.json")
    )
    args = parser.parse_args()
    asyncio.run(verify(args.output, args.run_sandbox))
