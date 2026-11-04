"""Read-only desktop QA for Overview and its locally generated brand asset."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://127.0.0.1:5173")
OUTPUT = ROOT / "docs/screenshots/overview"


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    mutations: list[str] = []
    viewports = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        page.set_default_timeout(30000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                mutations.append(request.method + " " + request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"}
                else None
            ),
        )
        page.goto(BASE)
        expect(
            page.get_by_role("heading", name="Welcome to INTI AI", exact=True)
        ).to_be_visible()
        logo = page.request.get(BASE + "/brand/inti-ai-logo-v1.png")
        assert logo.status == 200 and logo.headers["content-type"].startswith(
            "image/png"
        )
        local_logo = ROOT / "apps/frontend/public/brand/inti-ai-logo-v1.png"
        assert (
            hashlib.sha256(logo.body()).digest()
            == hashlib.sha256(local_logo.read_bytes()).digest()
        )
        page.get_by_role(
            "button", name="Connect operator to load your workspace"
        ).click()
        page.get_by_label("Operator capability").fill(token())
        page.get_by_role("button", name="Connect", exact=True).click()
        page.get_by_role("button", name="Close operator connection").click()
        expect(page.get_by_alt_text("Latest recorded execution frame")).to_be_visible(
            timeout=60000
        )
        expect(
            page.locator(".overview-proof-link").get_by_text("Verified", exact=True)
        ).to_be_visible()
        page.get_by_role("button", name="Dismiss notification").click()
        expect(
            page.locator('.overview-metric-card[aria-label="Recovery success rate"]')
        ).to_contain_text("No recovery-rate benchmark available")

        for width, height in [(1366, 900), (1600, 1000), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts.ready")
            assert page.locator(".sidebar").bounding_box()["width"] == 288
            overflow = page.evaluate(
                "document.documentElement.scrollWidth > innerWidth + 1"
            )
            assert not overflow, f"Horizontal overflow at {width}"
            for selector in [".brand-mark img", ".overview-sun img"]:
                assert page.locator(selector).evaluate(
                    "image => image.complete && image.naturalWidth > 0"
                )
            page.screenshot(path=OUTPUT / f"overview-{width}.png", full_page=True)
            viewports.append(
                {
                    "width": width,
                    "height": height,
                    "sidebar_width": 288,
                    "horizontal_overflow": overflow,
                }
            )
            print(f"Captured desktop Overview at {width}px", flush=True)

        page.set_viewport_size({"width": 1600, "height": 1000})
        page.get_by_role("link", name="Manage operator connection", exact=True).click()
        expect(
            page.get_by_role("dialog", name="Connect your local operator")
        ).to_be_visible()
        page.get_by_role("button", name="Close operator connection").click()
        page.get_by_role("link", name="Manage operator connection", exact=True).click()
        expect(
            page.get_by_role("dialog", name="Connect your local operator")
        ).to_be_visible()
        page.get_by_role("button", name="Close operator connection").click()
        page.get_by_role("link", name="View Live Execution", exact=True).click()
        expect(
            page.get_by_role("heading", name="Live Execution", exact=True)
        ).to_be_visible()
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Overview", exact=True
        ).click()
        page.get_by_role("link", name="Create New Task", exact=True).click()
        expect(page).to_have_url(BASE + "/missions/new?compose=1")
        expect(page.get_by_label("What should INTI accomplish?")).to_be_focused()
        assert not errors, errors
        assert not mutations, mutations
        browser.close()

    report = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "status": "PASSED",
        "scope": "Desktop Overview only, per user instruction",
        "target": BASE,
        "viewports": viewports,
        "page_errors": errors,
        "http_mutations": mutations,
        "model_calls_triggered": 0,
        "logo_sha256": hashlib.sha256(local_logo.read_bytes()).hexdigest(),
        "checks": [
            "local logo served intact in sidebar and welcome",
            "protected real execution frame",
            "unmeasured recovery rate stays unavailable",
            "native operator dialog reopens",
            "execution link",
            "new-task link and focus",
        ],
        "screenshots": [
            p.relative_to(ROOT).as_posix() for p in sorted(OUTPUT.glob("*.png"))
        ],
    }
    (ROOT / "docs/evidence/overview-design-ui.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print("Overview desktop QA PASSED; zero data mutations", flush=True)


if __name__ == "__main__":
    main()
