"""Review the desktop task ledger with persisted missions and no mutations."""

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
OUTPUT = ROOT / "docs/screenshots/tasks"


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
        page.goto(BASE + "/tasks")
        expect(
            page.get_by_role("heading", name="Task Manager", exact=True)
        ).to_be_visible()
        expect(page.get_by_text("Your mission history", exact=True)).to_be_visible()
        page.get_by_label("Operator capability", exact=True).fill(token())
        page.get_by_role("button", name="Connect", exact=True).click()
        page.get_by_role("button", name="Dismiss notification", exact=True).click()
        response = page.request.get(
            BASE + "/api/v1/missions?limit=20",
            headers={"Authorization": "Bearer " + token()},
        )
        assert response.ok
        missions = response.json()["items"]
        first = missions[0]
        failed = next(mission for mission in missions if mission["status"] == "FAILED")
        expect(page.locator(".task-detail-coverage")).to_contain_text(
            f"{len(missions)} of {len(missions)} task details available"
        )
        expect(page.locator(".task-table tbody tr")).to_have_count(len(missions))
        image = page.locator(".task-preview img")
        expect(image).to_be_visible()
        expect(image).to_have_js_property("complete", True)
        assert image.evaluate("image => image.naturalWidth > 0")
        expect(
            page.get_by_role("complementary", name="Selected mission")
        ).to_contain_text("VERIFIED_SUCCESS")
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
                page.locator(".task-manager-ledger").bounding_box()["x"]
                < page.locator(".task-side-column").bounding_box()["x"]
            )
            page.screenshot(path=OUTPUT / f"tasks-{width}.png", full_page=True)
            viewports.append(
                {"width": width, "height": height, "horizontal_overflow": overflow}
            )
            print(f"Captured Task Manager at {width}px", flush=True)
        page.set_viewport_size({"width": 1600, "height": 1000})
        page.get_by_role("button", name=re.compile(r"^Completed")).click()
        assert all(
            value == "COMPLETED"
            for value in page.locator(".task-execution-state").all_text_contents()
        )
        recovered = page.get_by_role("button", name=re.compile(r"^Recovered"))
        recovered_count = int(recovered.locator("span").inner_text())
        recovered.click()
        if recovered_count == 0:
            expect(
                page.get_by_text("No missions match these filters on this page.")
            ).to_be_visible()
        else:
            expect(page.locator(".task-table tbody tr")).to_have_count(recovered_count)
        page.get_by_role("button", name=re.compile(r"^All Tasks")).click()
        page.get_by_label("Search missions on this page", exact=True).fill(first["id"])
        expect(page.locator(".task-table tbody tr")).to_have_count(1)
        with page.expect_download() as pending:
            page.get_by_role(
                "button", name="Export visible tasks as JSON", exact=True
            ).click()
        ledger = json.loads(Path(pending.value.path()).read_text(encoding="utf-8"))
        assert (
            len(ledger["records"]) == 1
            and ledger["records"][0]["mission"]["id"] == first["id"]
        )
        assert ledger["scope"] == "Filtered records on the loaded page only"
        page.get_by_label("Search missions on this page", exact=True).fill("")
        page.get_by_label("Preparation status", exact=True).select_option("FAILED")
        page.get_by_role(
            "button", name="Inspect mission " + failed["id"], exact=True
        ).click()
        inspector = page.get_by_role("complementary", name="Selected mission")
        expect(inspector).to_contain_text(failed["error_code"])
        expect(
            inspector.get_by_text("No screenshot recorded for this task.", exact=True)
        ).to_be_visible()
        expect(
            inspector.get_by_role("link", name="Live Console", exact=True)
        ).to_have_count(0)
        with page.expect_download() as pending:
            inspector.get_by_role("button", name="JSON Trace", exact=True).click()
        trace = json.loads(Path(pending.value.path()).read_text(encoding="utf-8"))
        assert trace["mission"]["id"] == failed["id"] and trace["execution"] is None
        assert token() not in json.dumps(trace) and token() not in json.dumps(ledger)
        page.get_by_label("Preparation status", exact=True).select_option("")
        page.get_by_label("Creation window on this page", exact=True).select_option(
            "24"
        )
        current_ms = page.evaluate("Date.now()")
        recent_ids = [
            mission["id"]
            for mission in missions
            if 0
            <= current_ms
            - datetime.fromisoformat(mission["created_at"]).timestamp() * 1000
            <= 86400000
        ]
        expect(page.locator(".task-table tbody tr")).to_have_count(len(recent_ids))
        assert set(
            page.locator(".task-table tbody tr").evaluate_all(
                "rows => rows.map(row => row.dataset.missionId)"
            )
        ) == set(recent_ids)
        page.get_by_label("Creation window on this page", exact=True).select_option("0")
        page.get_by_role(
            "button", name="Inspect mission " + first["id"], exact=True
        ).click()
        expect(image).to_be_visible()
        inspector.get_by_role("link", name="Live Console", exact=True).click()
        expect(page).to_have_url(BASE + "/execution?execution=" + first["execution_id"])
        expect(
            page.get_by_alt_text("Latest execution browser observation")
        ).to_be_visible()
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Task Manager", exact=True
        ).click()
        inspector.get_by_role("link", name="Open Verification Lab", exact=True).click()
        expect(page).to_have_url(
            re.compile(
                re.escape(BASE) + r"/verification\?.*execution=" + first["execution_id"]
            )
        )
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Task Manager", exact=True
        ).click()
        page.locator(".task-manager-toolbar").get_by_role(
            "link", name="New Task", exact=True
        ).click()
        expect(page).to_have_url(BASE + "/missions/new?compose=1")
        expect(page.get_by_label("What should INTI accomplish?")).to_be_focused()
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Task Manager", exact=True
        ).click()
        page.reload()
        expect(page.get_by_text("Your mission history", exact=True)).to_be_visible()
        assert not errors, errors
        assert not mutations, mutations
        browser.close()
    report = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "status": "PASSED",
        "target": BASE,
        "scope": "Desktop Task Manager using a page of real saved missions",
        "viewports": viewports,
        "page_errors": errors,
        "http_mutations": mutations,
        "model_calls_triggered": 0,
        "checks": [
            "operator-protected mission history",
            "desktop ledger and focused inspector",
            "real protected screenshot and action receipts",
            "scoped completed/recovered/preparation/time/search filters",
            "visible-ledger JSON export",
            "selected-task JSON trace export",
            "failed preparation clears prior execution evidence",
            "execution and verification links",
            "new task navigation and focus",
            "reload clears capability without React errors",
        ],
        "screenshots": [
            path.relative_to(ROOT).as_posix() for path in sorted(OUTPUT.glob("*.png"))
        ],
    }
    (ROOT / "docs/evidence/tasks-design-ui.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "Task Manager desktop QA PASSED; zero HTTP mutations or model calls", flush=True
    )


if __name__ == "__main__":
    main()
