"""Inspect the real desktop Studio without model calls or HTTP mutations."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://127.0.0.1:5173")
OUTPUT = ROOT / "docs/screenshots/studio"


def main() -> None:
    expect.set_options(timeout=30000)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    mutations: list[str] = []
    development_modules: list[str] = []
    viewports = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        page.set_default_timeout(30000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: development_modules.append(request.url)
            if "/node_modules/.vite/" in request.url or "/@vite/client" in request.url
            else None,
        )
        page.on(
            "request",
            lambda request: (
                mutations.append(request.method + " " + request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"}
                else None
            ),
        )
        page.goto(BASE)
        assert page.locator('script[src^="/assets/index-"]').count() == 1
        page.get_by_role(
            "button", name="Connect operator to load your workspace"
        ).click()
        page.get_by_label("Operator capability").fill(token())
        page.get_by_role("button", name="Connect", exact=True).click()
        page.get_by_role("button", name="Close operator connection").click()
        page.get_by_role("button", name="Dismiss notification").click()
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="AI Agent Studio", exact=True
        ).click()
        expect(page.get_by_role("heading", name="Compiled Execution Tree")).to_be_visible()
        expect(page.get_by_role("button", name="Generate Plan", exact=True)).to_be_disabled()
        expect(page.get_by_role("button", name="Interpret scene", exact=True)).to_be_disabled()
        expect(page.locator(".studio-action-tree > li").first).to_be_visible()
        page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")
        for width, height in [(1366, 900), (1600, 1000), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            assert page.locator(".sidebar").bounding_box()["width"] == 288
            overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            assert not overflow, f"Horizontal overflow at {width}"
            page.screenshot(path=OUTPUT / f"studio-{width}.png", full_page=True)
            viewports.append({"width": width, "height": height, "horizontal_overflow": overflow})
            print(f"Captured desktop Studio at {width}px", flush=True)

        page.set_viewport_size({"width": 1600, "height": 1000})
        step = page.locator(".studio-action-tree details").nth(1)
        step.locator("summary").click()
        expect(step.get_by_role("heading", name="Expected result")).to_be_visible()
        expect(page.locator(".studio-focused-step code")).not_to_be_empty()
        page.locator(".studio-evidence summary").filter(has_text="Visual evidence").click()
        image = page.get_by_alt_text("Screenshot with recorded target bounds")
        expect(image).to_be_visible()
        expect(image).to_have_js_property("complete", True)
        assert image.evaluate("image => image.naturalWidth > 0")
        page.screenshot(path=OUTPUT / "studio-evidence.png", full_page=True)
        page.locator(".studio-evidence summary").filter(has_text="Plan metadata").click()
        page.get_by_role("button", name="Recent Syntheses", exact=True).click()
        expect(page.get_by_role("dialog", name="Recent Syntheses")).to_be_visible()
        page.get_by_role("button", name="Close saved plans").click()
        page.get_by_role("button", name="Reset", exact=True).click()
        expect(page.get_by_label("Natural-language objective")).to_have_value("")
        expect(page.get_by_role("heading", name="No plan selected")).to_be_visible()
        page.get_by_label("Natural-language objective").fill("Read-only QA draft")
        page.get_by_label("Natural-language objective").press("Control+Enter")
        page.get_by_role("button", name="Recent Syntheses", exact=True).click()
        page.locator(".studio-history-dialog .plan-history button").first.click()
        expect(page.get_by_role("heading", name="Compiled Execution Tree")).to_be_visible()
        for _ in range(2):
            page.reload()
            expect(page.get_by_role("heading", name="AI Agent Studio", exact=True)).to_be_visible()
            expect(page.get_by_role("heading", name="Compiled Execution Tree")).to_be_visible()
        expect(page.get_by_role("link", name="Connect your local operator", exact=True)).to_be_visible()
        assert not errors, errors
        assert not mutations, mutations
        assert not development_modules, development_modules
        browser.close()

    report = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "status": "PASSED",
        "scope": "AI Agent Studio desktop design and read-only interactions",
        "target": BASE,
        "viewports": viewports,
        "page_errors": errors,
        "http_mutations": mutations,
        "model_calls_triggered": 0,
        "development_module_requests": development_modules,
        "checks": [
            "saved real plan and typed action tree",
            "operator-authenticated screenshot evidence",
            "expandable action and focused inspector",
            "history dialog and reload of persisted plan",
            "reset clears the draft and selected plan",
            "disabled model buttons and Ctrl+Enter cannot initiate calls",
            "compiled bootstrap and repeated cached reloads without hook errors",
            "protected evidence explains operator connection after reload",
        ],
        "screenshots": [p.relative_to(ROOT).as_posix() for p in sorted(OUTPUT.glob("*.png"))],
    }
    (ROOT / "docs/evidence/studio-design-ui.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print("Studio desktop QA PASSED; zero HTTP mutations or model calls", flush=True)


if __name__ == "__main__":
    main()
