"""Read-only desktop inspection of real captured observation evidence."""

from __future__ import annotations

import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://127.0.0.1:5173")
OUTPUT = ROOT / "docs/screenshots/observations"


def main() -> None:
    expect.set_options(timeout=30000)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    mutations: list[str] = []
    viewports = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(
            viewport={"width": 1600, "height": 1000}, accept_downloads=True
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                mutations.append(request.method + " " + request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"}
                else None
            ),
        )
        page.goto(BASE + "/observations")
        expect(
            page.get_by_role("heading", name="Visual Observations", exact=True)
        ).to_be_visible()
        image = page.locator(".observation-viewer-card .observation-canvas > img")
        expect(image).to_be_visible()
        expect(image).to_have_js_property("complete", True)
        assert image.evaluate("image => image.naturalWidth > 0")
        expect(
            page.get_by_role("button", name="Raw Frame", exact=True)
        ).to_have_attribute("aria-pressed", "true")
        for width, height in [(1366, 900), (1600, 1000), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts.ready")
            overflow = page.evaluate(
                "document.documentElement.scrollWidth > innerWidth + 1"
            )
            assert not overflow, f"Horizontal overflow at {width}"
            assert page.locator(".sidebar").bounding_box()["width"] == 288
            page.screenshot(path=OUTPUT / f"observations-{width}.png", full_page=True)
            viewports.append(
                {"width": width, "height": height, "horizontal_overflow": overflow}
            )
            print(f"Captured Visual Observations at {width}px", flush=True)
        page.set_viewport_size({"width": 1600, "height": 1000})
        page.get_by_label("Search observations", exact=True).fill(
            "no-such-observation-qa"
        )
        expect(page.get_by_text("No observations match these filters.")).to_be_visible()
        page.get_by_label("Search observations", exact=True).fill("")
        page.get_by_role("button", name="Grid", exact=True).click()
        expect(
            page.get_by_role("region", name="Observation viewer", exact=True)
        ).not_to_be_visible()
        page.locator(".observation-capture-card").nth(1).click()
        expect(
            page.get_by_role("region", name="Observation viewer", exact=True)
        ).to_be_visible()
        page.get_by_role("button", name="Expand frame", exact=True).click()
        expect(page.locator(".frame-expanded")).to_be_visible()
        page.get_by_role("button", name="Fit to viewport", exact=True).click()
        with page.expect_download() as pending:
            page.get_by_role("link", name="Export Frame", exact=True).click()
        downloaded = pending.value
        assert downloaded.suggested_filename.startswith("inti-observation-")
        assert Path(downloaded.path()).read_bytes().startswith(b"\x89PNG\r\n\x1a\n")

        page.goto(BASE)
        page.get_by_role(
            "button", name="Connect operator to load your workspace"
        ).click()
        page.get_by_label("Operator capability").fill(token())
        page.get_by_role("button", name="Connect", exact=True).click()
        page.get_by_role("button", name="Close operator connection").click()
        page.get_by_role("button", name="Dismiss notification").click()
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Visual Observations", exact=True
        ).click()
        page.get_by_role("button", name="Plan Frames", exact=True).click()
        expect(page.locator(".observation-capture-card").first).to_be_visible()
        page.locator(".observation-capture-card").first.click()
        expect(image).to_have_attribute("src", re.compile(r"^blob:"))
        expect(image).to_have_js_property("complete", True)
        assert image.evaluate("image => image.naturalWidth > 0")
        expect(page.locator(".observation-bound").first).to_be_visible()
        target = page.locator(".observation-bound").first
        target.click()
        expect(target).to_have_attribute("aria-pressed", "true")
        expect(
            page.locator('.observation-element-list button[aria-pressed="true"]')
        ).to_have_count(1)
        page.get_by_role("button", name="Raw Frame", exact=True).click()
        expect(page.locator(".observation-bound")).to_have_count(0)
        page.get_by_role("button", name="Identified Bounding Boxes", exact=True).click()
        expect(page.locator(".observation-bound").first).to_be_visible()
        page.get_by_text("Model interpretation", exact=True).click()
        expect(
            page.get_by_role("button", name="Analyze with Meta", exact=True)
        ).to_be_disabled()
        page.locator(".observations-gallery").scroll_into_view_if_needed()
        expect(
            page.locator(".observation-thumbnail .observation-frame-empty")
        ).to_have_count(0)
        page.wait_for_function(
            "Array.from(document.querySelectorAll('.observation-thumbnail img')).every(image => image.complete && image.naturalWidth > 0)"
        )
        page.evaluate("window.scrollTo(0, 0)")
        page.screenshot(path=OUTPUT / "observations-protected-plan.png", full_page=True)
        page.get_by_role("button", name="Refresh observations", exact=True).click()
        page.wait_for_load_state("networkidle")
        page.get_by_role("link", name=re.compile(r"^Inspect associated plan")).click()
        expect(
            page.get_by_role("heading", name="Compiled Execution Tree", exact=True)
        ).to_be_visible()
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Visual Observations", exact=True
        ).click()
        page.reload()
        expect(
            page.get_by_role("heading", name="Visual Observations", exact=True)
        ).to_be_visible()
        assert not errors, errors
        assert not mutations, mutations
        browser.close()
    report = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "status": "PASSED",
        "target": BASE,
        "scope": "Desktop Visual Observations and existing recorded evidence",
        "viewports": viewports,
        "page_errors": errors,
        "http_mutations": mutations,
        "model_calls_triggered": 0,
        "checks": [
            "real public screenshots",
            "search and grid selection",
            "frame expansion",
            "PNG frame export",
            "authenticated saved plan evidence",
            "recorded target overlays and inspector synchronization",
            "raw frame toggle",
            "disabled real model calls",
            "plan deep link",
            "reload without React hook errors",
        ],
        "screenshots": [
            path.relative_to(ROOT).as_posix() for path in sorted(OUTPUT.glob("*.png"))
        ],
    }
    (ROOT / "docs/evidence/observations-design-ui.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "Visual Observations QA PASSED; zero HTTP mutations or model calls", flush=True
    )


if __name__ == "__main__":
    main()
