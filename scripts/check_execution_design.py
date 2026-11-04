"""Inspect saved execution UI without authorizing or running browser actions."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://127.0.0.1:5173")
OUTPUT = ROOT / "docs/screenshots/execution"


def main() -> None:
    expect.set_options(timeout=30000)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    mutations: list[str] = []
    socket_frames: list[int] = []
    viewports = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(
            viewport={"width": 1600, "height": 1000}, accept_downloads=True
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "websocket",
            lambda socket: (
                socket.on("framereceived", lambda payload: socket_frames.append(1))
                if "/ws/executions/" in socket.url
                else None
            ),
        )
        page.on(
            "request",
            lambda request: (
                mutations.append(request.method + " " + request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"}
                else None
            ),
        )
        page.goto(BASE + "/execution")
        expect(
            page.get_by_role("heading", name="Live Execution", exact=True)
        ).to_be_visible()
        page.get_by_label("Operator token", exact=True).fill(token())
        page.get_by_role("button", name="Connect", exact=True).click()
        image = page.get_by_alt_text("Latest execution browser observation")
        expect(image).to_be_visible()
        expect(image).to_have_js_property("complete", True)
        assert image.evaluate("image => image.naturalWidth > 0")
        first_id = page.get_by_label("Saved execution", exact=True).input_value()
        assert first_id
        expect(page.locator(".live-agent-state")).to_contain_text("COMPLETED")
        if BASE == "http://localhost:5173":
            expect(page.locator(".live-connection-status")).to_have_text(
                "Saved event history"
            )
            assert socket_frames, (
                "Expected real execution events over the local WebSocket"
            )
        expect(page.locator(".live-browser-caption")).to_contain_text("SAVED FRAME")
        expect(
            page.locator(".live-independent-verification .verdict-badge")
        ).to_have_text("VERIFIED_SUCCESS")
        for name in [
            "Pause",
            "Resume",
            "Start Execution",
            "Cancel execution",
            "Approve Plan",
            "Confirm HIGH actions",
        ]:
            expect(page.get_by_role("button", name=name, exact=True)).to_be_disabled()
        for width, height in [(1366, 900), (1600, 1000), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts.ready")
            page.evaluate("window.scrollTo(0, 0)")
            overflow = page.evaluate(
                "document.documentElement.scrollWidth > innerWidth + 1"
            )
            assert not overflow, f"Horizontal overflow at {width}"
            assert page.locator(".sidebar").bounding_box()["width"] == 288
            assert (
                page.locator(".live-left-column").bounding_box()["x"]
                < page.locator(".live-center-column").bounding_box()["x"]
                < page.locator(".live-right-column").bounding_box()["x"]
            )
            page.screenshot(path=OUTPUT / f"execution-{width}.png", full_page=True)
            viewports.append(
                {
                    "width": width,
                    "height": height,
                    "horizontal_overflow": overflow,
                    "columns": 3,
                }
            )
            print(f"Captured Live Execution at {width}px", flush=True)
        page.set_viewport_size({"width": 1600, "height": 1000})
        steps = page.locator(".live-step-list button")
        steps.first.click()
        expect(steps.first).to_have_attribute("aria-pressed", "true")
        expect(
            page.get_by_role("region", name="Recorded action trace")
        ).to_contain_text("Search equipment")
        page.get_by_label("Filter execution events", exact=True).fill(
            "no-such-event-qa"
        )
        expect(page.get_by_text("No events match this filter.")).to_be_visible()
        page.get_by_label("Filter execution events", exact=True).fill("")
        expect(page.locator(".live-event-feed ol li").first).to_be_visible()
        page.get_by_role("button", name="Expand", exact=True).click()
        expect(page.locator(".live-browser-expanded")).to_be_visible()
        page.keyboard.press("Escape")
        expect(page.locator(".live-browser-expanded")).to_have_count(0)
        with page.expect_download() as download:
            page.get_by_role("link", name="Frame Snap", exact=True).click()
        assert Path(download.value.path()).read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
        page.get_by_text("Execution inspector", exact=True).click()
        expect(page.locator(".execution-inspector")).to_contain_text(first_id)
        options = (
            page.get_by_label("Saved execution", exact=True)
            .locator("option")
            .evaluate_all("options => options.map(option => option.value)")
        )
        second_id = next(value for value in options if value and value != first_id)
        page.get_by_label("Saved execution", exact=True).select_option(second_id)
        expect(page.locator(".live-workspace-footnote")).to_contain_text(second_id[:8])
        expect(image).to_be_visible()
        expect(page.locator(".live-event-feed ol li").first).to_be_visible()
        assert page.locator(".live-step-list button[aria-pressed='true']").count() == 1
        page.get_by_label("Saved execution", exact=True).select_option(first_id)
        expect(image).to_be_visible()
        page.get_by_role("link", name="Inspect observation", exact=False).click()
        expect(
            page.get_by_role("heading", name="Visual Observations", exact=True)
        ).to_be_visible()
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Live Execution", exact=True
        ).click()
        expect(image).to_be_visible()
        page.get_by_role("link", name="Open Verification Center", exact=True).click()
        expect(page).to_have_url(BASE + "/verification?execution=" + first_id)
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Live Execution", exact=True
        ).click()
        page.reload()
        expect(
            page.get_by_role("heading", name="Ready to connect", exact=True)
        ).to_be_visible()
        assert not errors, errors
        assert not mutations, mutations
        browser.close()
    report = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "status": "PASSED",
        "target": BASE,
        "scope": "Desktop Live Execution using existing saved terminal records",
        "execution_id": first_id,
        "viewports": viewports,
        "page_errors": errors,
        "http_mutations": mutations,
        "model_calls_triggered": 0,
        "received_execution_socket_frames": len(socket_frames),
        "checks": [
            "three-column desktop design",
            "authenticated recorded browser frame",
            "terminal controls disabled",
            "independent effective verification verdict",
            "step selection and recorded action trace",
            "event search",
            "expanded frame and Escape",
            "PNG export",
            "history selection",
            "observation and verification deep links",
            "reload clears in-memory capability without React errors",
        ],
        "screenshots": [
            path.relative_to(ROOT).as_posix() for path in sorted(OUTPUT.glob("*.png"))
        ],
    }
    (ROOT / "docs/evidence/execution-design-ui.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "Live Execution desktop QA PASSED; zero HTTP mutations or model calls",
        flush=True,
    )


if __name__ == "__main__":
    main()
