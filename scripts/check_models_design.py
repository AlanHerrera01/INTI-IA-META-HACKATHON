"""Read-only AI Models UI QA; never probes a model or changes configuration."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://localhost:5173")
OUTPUT = ROOT / "docs/screenshots/models"


def main() -> None:
    expect.set_options(timeout=30000)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    mutations: list[str] = []
    viewports = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        context.on("request", lambda request: mutations.append(request.method + " " + request.url) if request.method not in {"GET", "HEAD", "OPTIONS"} else None)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        before = context.request.get("http://localhost:8001/api/inventory").json()
        status = context.request.get(BASE + "/api/v1/models/status").json()
        flags = context.request.get(BASE + "/api/v1/capabilities").json()
        system = context.request.get(BASE + "/api/v1/system/status").json()
        observations = context.request.get(BASE + "/api/v1/observations").json()
        page.goto(BASE + "/models")
        expect(page.get_by_role("heading", name="AI Models & Multi-Modal Engines", exact=True)).to_be_visible()
        expect(page.get_by_role("heading", name=status["model"], exact=True)).to_be_visible()
        expect(page.get_by_role("navigation", name="Main navigation").get_by_role("link", name="AI Models", exact=True)).to_have_attribute("aria-current", "page")
        connection = page.get_by_label("Model connection", exact=True)
        expect(connection).to_contain_text("Configured" if status["configured"] else "Not configured")
        last = "Not established" if status["available"] is None else "Last analysis succeeded" if status["available"] else "Last analysis failed"
        expect(connection).to_contain_text(last)
        expect(connection).to_contain_text("Enabled" if flags["model_calls_enabled"] else "Disabled")
        expect(page.get_by_text("Not measured", exact=True)).to_have_count(4)
        expect(page.get_by_role("region", name="Runtime environment", exact=True)).to_contain_text(system["version"])
        if observations:
            latest = observations[0]
            image = page.get_by_alt_text("Recorded input: " + latest["page_title"], exact=True)
            expect(image).to_be_visible()
            page.wait_for_function("document.querySelector('.models-recorded-frame img')?.naturalWidth > 0")
            expect(image).to_have_attribute("src", latest["screenshot_url"])
            expect(page.get_by_text("RECORDED CAPTURE / NOT A LIVE STREAM", exact=True)).to_be_visible()
            expect(page.get_by_role("link", name="Inspect observation", exact=True)).to_have_attribute("href", "/observations/" + latest["id"])
        else:
            expect(page.get_by_text("No saved public observations", exact=True)).to_be_visible()
            expect(page.locator(".models-recorded-frame img")).to_have_count(0)
        for width, height in [(1366, 900), (1600, 1000), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            page.evaluate("document.fonts.ready")
            page.evaluate("window.scrollTo(0, 0)")
            overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            assert not overflow, f"Horizontal overflow at {width}"
            assert page.locator(".sidebar").bounding_box()["width"] == 288
            cards = page.locator(".models-metrics > section")
            assert cards.nth(0).bounding_box()["y"] == cards.nth(3).bounding_box()["y"]
            assert page.locator(".models-main").bounding_box()["x"] < page.locator(".models-sidebar").bounding_box()["x"]
            page.screenshot(path=OUTPUT / f"models-{width}.png", full_page=True)
            viewports.append({"width": width, "height": height, "horizontal_overflow": overflow, "four_metrics_one_row": True, "main_and_sidebar_columns": True})
            print(f"Captured AI Models at {width}px", flush=True)
        guide_button = page.get_by_role("button", name="Configuration guide", exact=True)
        guide_button.click()
        guide = page.get_by_role("region", name="Model configuration guide", exact=True)
        expect(guide).to_be_visible()
        expect(guide).to_contain_text("META_API_KEY")
        expect(guide).to_contain_text("META_MODEL_ID")
        expect(page.get_by_role("textbox")).to_have_count(0)
        # The shell search uses a button; model configuration has no credential form.
        guide_button.click()
        expect(guide).to_have_count(0)
        page.get_by_role("button", name="Refresh diagnostics", exact=True).click()
        expect(page.get_by_role("button", name="Refresh diagnostics", exact=True)).to_be_enabled()
        page.get_by_role("link", name="View benchmarks", exact=True).click()
        expect(page.get_by_role("heading", name="Analytics & Benchmarks", exact=True)).to_be_visible()
        page.go_back()
        expect(page.get_by_role("heading", name="AI Models & Multi-Modal Engines", exact=True)).to_be_visible()
        page.get_by_role("link", name="Review Settings", exact=True).click()
        expect(page.get_by_role("heading", name="System Settings & Platform Configuration", exact=True)).to_be_visible()
        page.goto(BASE + "/models")
        page.reload()
        expect(page.get_by_role("heading", name=status["model"], exact=True)).to_be_visible()
        after = context.request.get("http://localhost:8001/api/inventory").json()
        flags_after = context.request.get(BASE + "/api/v1/capabilities").json()
        model_after = context.request.get(BASE + "/api/v1/models/status").json()
        assert before == after
        assert flags == flags_after and status == model_after
        assert not mutations, mutations
        assert not errors, errors
        browser.close()
    result = {"generated_at": datetime.now(UTC).isoformat(), "target": BASE, "source": "Real local model status, server capabilities, dependency checks and public recorded observation", "model": status["model"], "configured": status["configured"], "last_analysis_available": status["available"], "model_calls_enabled": flags["model_calls_enabled"], "recorded_observation": observations[0]["id"] if observations else None, "viewports": viewports, "checks": ["current model and permission diagnostics", "unmeasured performance values stay unmeasured", "real saved frame without live or model-analysis claims", "configuration guide without credential input", "read-only refresh", "benchmark and Settings navigation", "compiled-page reload"], "http_mutations": mutations, "page_errors": errors, "meta_calls": 0, "inventory_unchanged": before == after, "model_configuration_unchanged": flags == flags_after and status == model_after, "limitations": "Configured/available/error combinations use labeled unit fixtures; browser QA makes no inference calls or configuration writes."}
    (ROOT / "docs/evidence/models-design-ui.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "configured": status["configured"], "model_calls_enabled": flags["model_calls_enabled"], "mutations": mutations, "page_errors": errors}))


if __name__ == "__main__":
    main()
