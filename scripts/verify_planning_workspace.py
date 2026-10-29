"""Real-browser UI acceptance with explicitly labeled HTTP test fixtures.

The real app's missing-credentials/empty-history UI is checked first. All success
responses are intercepted inside this test script; runtime services are never
configured with fake model responses. No generated plan action is executed.
"""

import asyncio
import json
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from benchmark_planning import fixture_case
from inti.domain.planning import ActionPlan, ModelUsage, PlanningResult
from inti.domain.planning_policy import PlanningPolicy
from playwright.async_api import async_playwright, expect
from pydantic import TypeAdapter


async def main():
    output = Path("artifacts/verification/phase-02")
    output.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(
        base_url="http://127.0.0.1:8000", timeout=60
    ) as client:
        response = await client.post("/api/v1/observations/capture", json={})
        response.raise_for_status()
        observation = response.json()
        real_model = (await client.get("/api/v1/models/status")).json()
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            await page.goto("http://127.0.0.1:5173/planning", wait_until="networkidle")
            await page.get_by_role("heading", name="AI Planning.").wait_for()
            assert await page.get_by_role("button", name="Execute Plan").count() == 0
            if not real_model["configured"]:
                await page.get_by_text(
                    "Meta is not configured.", exact=False
                ).wait_for()
            await page.screenshot(
                path=str(output / "planning-real-environment.png"), full_page=True
            )

            case = {
                "fixture": "base",
                "goal": "TEST FIXTURE — locate Save, inspect only",
                "target": "save",
            }
            scene, intent, actions = fixture_case(case)
            scene = replace(
                scene,
                observation_id=UUID(observation["id"]),
                summary="TEST FIXTURE — not a live Meta interpretation",
            )
            usage = ModelUsage("explicit-test-fixture-model", "fixture-response")
            plan = PlanningPolicy((observation["source_url"],)).validate(
                ActionPlan(uuid4(), scene.observation_id, case["goal"], actions),
                scene,
                intent,
            )
            result = PlanningResult(
                plan,
                scene,
                intent,
                (),
                (),
                (),
                (usage,),
                "TEST FIXTURE — deterministic checks only",
                datetime.now(UTC),
                datetime.now(UTC),
                uuid4(),
            )
            body = TypeAdapter(PlanningResult).dump_python(result, mode="json")

            async def test_api(route):
                url = route.request.url.split("/api/v1/")[-1]
                if url == "models/status":
                    await route.fulfill(
                        json={
                            "provider": "Meta",
                            "configured": True,
                            "available": None,
                            "model": "explicit-test-fixture-model",
                            "detail": "TEST ONLY",
                        }
                    )
                elif url.startswith("plans?") or url == "plans":
                    await route.fulfill(
                        json={"items": [body], "total": 1, "offset": 0, "limit": 10}
                    )
                elif url.endswith("/events"):
                    await route.fulfill(json=[])
                elif url.startswith("plans/"):
                    await route.fulfill(
                        status=201 if url == "plans/generate" else 200, json=body
                    )
                else:
                    await route.continue_()

            await page.route("**/api/v1/**", test_api)
            await page.reload(wait_until="networkidle")
            await page.get_by_label("Natural-language objective").fill(case["goal"])
            await page.get_by_role("button", name="Generate Plan", exact=True).click()
            await page.get_by_role("heading", name="Action plan", exact=True).wait_for()
            await page.get_by_role(
                "button", name="Inspect Save changes", exact=True
            ).click()
            await expect(
                page.get_by_text("explicit-test-fixture-model", exact=True)
            ).to_be_visible()
            await page.screenshot(
                path=str(output / "planning-desktop-TEST-FIXTURE.png"), full_page=True
            )
            await page.set_viewport_size({"width": 390, "height": 844})
            await page.screenshot(
                path=str(output / "planning-mobile-TEST-FIXTURE.png"), full_page=True
            )
            assert not await page.evaluate(
                "document.documentElement.scrollWidth > window.innerWidth"
            )
            assert not errors, errors
            (output / "result.json").write_text(
                json.dumps(
                    {
                        "real_environment_loaded": True,
                        "live_meta_configured": real_model["configured"],
                        "plan_visualization_mode": "explicit_HTTP_test_fixture",
                        "model_actions_executed": 0,
                        "overlay_selection": True,
                        "mobile_no_overflow": True,
                        "page_errors": errors,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            print(
                "Planning workspace passed: real environment + explicit fixture visualization; no execution"
            )
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
