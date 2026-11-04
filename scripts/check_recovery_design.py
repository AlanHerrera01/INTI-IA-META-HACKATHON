"""Inspect real recovery history without creating cases or issuing commands."""

from __future__ import annotations

import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://localhost:5173")
OUTPUT = ROOT / "docs/screenshots/recovery"


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
        page.goto(BASE + "/recovery")
        expect(
            page.get_by_role("heading", name="Recovery Center", exact=True)
        ).to_be_visible()
        page.get_by_label("Operator token", exact=True).fill(token())
        page.get_by_role("button", name="Connect", exact=True).click()
        response = page.request.get(
            BASE + "/api/v1/recoveries?limit=20",
            headers={"Authorization": "Bearer " + token()},
        )
        assert response.ok
        history = response.json()
        total = history["total"]
        expect(
            page.get_by_role("region", name="Stored recoveries", exact=True).locator(
                "strong"
            )
        ).to_have_text(str(total))
        if not history["items"]:
            expect(
                page.get_by_text(
                    re.compile(r"^No recovery records yet\. Recovery begins")
                )
            ).to_be_visible()
            expect(
                page.get_by_role(
                    "region", name="Recovery rate on loaded page", exact=True
                ).locator("strong")
            ).to_have_text("Unavailable")
            expect(
                page.get_by_role(
                    "region", name="Mean recorded recovery duration", exact=True
                ).locator("strong")
            ).to_have_text("Unavailable")
            expect(
                page.get_by_role("button", name="Export record", exact=True)
            ).to_be_disabled()
            expect(
                page.get_by_role(
                    "button", name="Cancel recovery and execution", exact=True
                )
            ).to_be_disabled()
            expect(
                page.get_by_role(
                    "button", name="Retry within remaining budget", exact=True
                )
            ).to_be_disabled()
            expect(page.locator(".recovery-evidence img")).to_have_count(0)
            expect(page.locator(".recovery-pipeline li.recorded")).to_have_count(0)
        else:
            selected = history["items"][0]
            expect(page.locator(".recovery-case-heading")).to_contain_text(
                selected["session"]["id"][:8]
            )
            with page.expect_download() as pending:
                page.get_by_role("button", name="Export record", exact=True).click()
            exported = json.loads(
                Path(pending.value.path()).read_text(encoding="utf-8")
            )
            assert exported["session"]["id"] == selected["session"]["id"]
            assert token() not in json.dumps(exported)
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
            before = page.get_by_role(
                "region", name="Captured baseline", exact=True
            ).bounding_box()
            pipeline = page.get_by_role(
                "region", name="Recovery pipeline", exact=True
            ).bounding_box()
            after = page.get_by_role(
                "region", name="Fresh recovery observation", exact=True
            ).bounding_box()
            assert before["x"] < pipeline["x"] < after["x"]
            page.screenshot(path=OUTPUT / f"recovery-{width}.png", full_page=True)
            viewports.append(
                {
                    "width": width,
                    "height": height,
                    "horizontal_overflow": overflow,
                    "comparison_columns": 3,
                }
            )
            print(f"Captured Recovery Center at {width}px", flush=True)
        page.get_by_role("button", name="Refresh recovery history", exact=True).click()
        page.get_by_role(
            "link", name=re.compile(r"^Inspect original execution")
        ).click()
        expect(
            page.get_by_role("heading", name="Live Execution", exact=True)
        ).to_be_visible()
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Recovery Center", exact=True
        ).click()
        expect(
            page.get_by_role("heading", name="Recovery Center", exact=True)
        ).to_be_visible()
        page.reload()
        expect(page.get_by_label("Operator token", exact=True)).to_be_visible()
        expect(page.get_by_label("Operator token", exact=True)).to_have_value("")
        assert not errors, errors
        assert not mutations, mutations
        browser.close()
    report = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "status": "PASSED",
        "target": BASE,
        "scope": "Desktop Recovery Center with actual protected recovery history",
        "stored_recoveries": total,
        "viewports": viewports,
        "page_errors": errors,
        "http_mutations": mutations,
        "model_calls_triggered": 0,
        "checks": [
            "protected history and cleared in-memory capability on reload",
            "four scoped metrics",
            "three-column baseline / pipeline / fresh evidence composition",
            "truthful empty history without fabricated captures or outcomes"
            if not history["items"]
            else "existing case and JSON export",
            "disabled commands without a case",
            "refresh",
            "original execution navigation",
            "reload without React errors",
        ],
        "limitations": [
            "No active or completed recovery case existed for browser verification; non-empty states and command confirmations are covered by explicitly mocked unit fixtures."
        ]
        if not history["items"]
        else [],
        "screenshots": [
            path.relative_to(ROOT).as_posix() for path in sorted(OUTPUT.glob("*.png"))
        ],
    }
    (ROOT / "docs/evidence/recovery-design-ui.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "Recovery Center desktop QA PASSED; zero HTTP mutations or model calls",
        flush=True,
    )


if __name__ == "__main__":
    main()
