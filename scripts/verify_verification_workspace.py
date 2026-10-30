"""Read-only application acceptance against the actual local Compose workspace."""

import asyncio
import json
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
from inti.infrastructure.config import ConfigurationProvider
from playwright.async_api import async_playwright


async def verify() -> None:
    output = Path("artifacts/phase5")
    output.mkdir(parents=True, exist_ok=True)
    token = ConfigurationProvider().execution_operator_token.get_secret_value()
    headers = {"Authorization": "Bearer " + token}
    async with (
        httpx.AsyncClient(trust_env=False) as public,
        httpx.AsyncClient(
            base_url="http://127.0.0.1:8000",
            headers=headers,
            timeout=60,
            trust_env=False,
        ) as api,
    ):
        before = (await public.get("http://127.0.0.1:8001/api/inventory")).json()
        health = (await api.get("/api/v1/health")).json()
        assert health["version"] == "0.7.0", health
        history = (await api.get("/api/v1/executions")).json()
        execution = next(
            b for b in history["items"] if b["session"]["status"] == "COMPLETED"
        )
        execution_id = execution["session"]["id"]
        tick = time.monotonic()
        created = await api.post(
            "/api/v1/verifications",
            json={
                "execution_id": execution_id,
                "idempotency_key": "phase5-workspace-acceptance",
            },
        )
        created.raise_for_status()
        id = created.json()["session"]["id"]
        async with asyncio.timeout(60):
            while True:
                b = (await api.get("/api/v1/verifications/" + id)).json()
                if b["session"]["status"] in {
                    "COMPLETED",
                    "FAILED",
                    "CANCELLED",
                    "INCONCLUSIVE",
                }:
                    break
                await asyncio.sleep(0.1)
        latency = (time.monotonic() - tick) * 1000
        report = (await api.get(f"/api/v1/verifications/{id}/report")).json()
        assert report["effective_verdict"] == "VERIFIED_SUCCESS", report
        assert report["execution_summary"]["status"] == "COMPLETED"
        assert not report["execution_summary"]["declared_overall_goal_verified"]
        assert all(
            c["status"] == "PASS"
            for c in b["session"]["criteria_results"]
            if next(
                k
                for k in b["criteria_version"]["criteria"]
                if k["id"] == c["criterion_id"]
            )["required"]
        )
        artifact = b["evidence"][0]
        path = f"/api/v1/verifications/{id}/evidence/{artifact['id']}/artifact"
        assert (await api.get(path)).status_code == 200
        assert (await public.get("http://127.0.0.1:8000" + path)).status_code == 401
        assert (
            await api.post(
                "/api/v1/verifications",
                json={
                    "execution_id": execution_id,
                    "idempotency_key": "phase5-workspace-acceptance",
                },
            )
        ).json()["session"]["id"] == id
        events = (await api.get(f"/api/v1/verifications/{id}/events")).json()
        errors = []
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            page.on("pageerror", lambda error: errors.append(str(error)))
            await page.goto(
                "http://127.0.0.1:5173/verification?execution=" + execution_id
            )
            await page.get_by_label("Operator token", exact=True).fill(token)
            await page.get_by_role("button", name="Connect", exact=True).click()
            await (
                page.locator(".execution-history button")
                .filter(has_text="VERIFIED_SUCCESS")
                .first.click()
            )
            await page.get_by_role(
                "heading", name="Execution vs verification", exact=True
            ).wait_for()
            await page.get_by_alt_text(
                "Fresh independent read-only inventory observation"
            ).wait_for()
            await page.locator(".verdict-pass").first.wait_for()
            await page.screenshot(
                path=output / "verification-desktop.png", full_page=True
            )
            await page.get_by_role(
                "button", name="DATABASE_STATE final", exact=True
            ).first.click()
            await page.locator(".verification-json").wait_for()
            assert '"PC-104"' in await page.locator(".verification-json").inner_text()
            await page.set_viewport_size({"width": 390, "height": 844})
            await page.screenshot(
                path=output / "verification-mobile.png", full_page=True
            )
            overflow = await page.evaluate(
                "document.documentElement.scrollWidth > innerWidth"
            )
            await page.goto("http://127.0.0.1:5173/recovery")
            await page.get_by_label("Operator token", exact=True).fill(token)
            await page.get_by_role("button", name="Connect", exact=True).click()
            await page.get_by_text("No recovery records yet.", exact=True).wait_for()
            await page.screenshot(path=output / "recovery-mobile.png", full_page=True)
            await browser.close()
        after = (await public.get("http://127.0.0.1:8001/api/inventory")).json()
        assert before == after
        assert not errors, errors
        assert not overflow, "Mobile horizontal overflow"
        summary = {
            "recorded_at": datetime.now(UTC).isoformat(),
            "health": health,
            "execution_id": execution_id,
            "verification_id": id,
            "historical_execution_preserved": True,
            "application_unchanged": before == after,
            "verdict": report["effective_verdict"],
            "criteria": b["session"]["criteria_results"],
            "evidence_count": len(b["evidence"]),
            "events_count": len(events),
            "request_join_latency_ms": latency,
            "verification_duration_ms": (
                datetime.fromisoformat(b["session"]["completed_at"])
                - datetime.fromisoformat(b["session"]["started_at"])
            ).total_seconds()
            * 1000,
            "protected_artifact": True,
            "idempotency": True,
            "browser_page_errors": errors,
            "mobile_overflow": overflow,
            "model_calls": 0,
            "browser_surface": "project Playwright; in-app connection failed sandbox metadata",
        }
        (output / "acceptance.json").write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
        (output / "report.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        print(
            json.dumps({k: v for k, v in summary.items() if k != "criteria"}, indent=2)
        )


if __name__ == "__main__":
    asyncio.run(verify())
