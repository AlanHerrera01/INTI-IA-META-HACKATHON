"""Read-only Activity Logs QA over the actual protected bounded event feed."""

from __future__ import annotations

import csv
import io
import json
import os
from datetime import UTC, datetime
from pathlib import Path

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://localhost:5173")
OUTPUT = ROOT / "docs/screenshots/activity"


def main() -> None:
    expect.set_options(timeout=30000)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    mutations: list[str] = []
    viewports = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 1600, "height": 1000}, accept_downloads=True, permissions=["clipboard-read", "clipboard-write"])
        context.on("request", lambda request: mutations.append(request.method + " " + request.url) if request.method not in {"GET", "HEAD", "OPTIONS"} else None)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        before = context.request.get("http://localhost:8001/api/inventory").json()
        flags = context.request.get(BASE + "/api/v1/capabilities").json()
        response = context.request.get(BASE + "/api/v1/mission-control", headers={"Authorization": "Bearer " + token()})
        assert response.ok
        events = response.json()["recent_events"]
        assert events and len(events) <= 20
        counts = {source: sum(event["source"] == source for event in events) for source in ["execution", "recovery", "verification", "planning"]}
        page.goto(BASE + "/activity")
        expect(page.get_by_role("heading", name="System & Agent Activity Logs", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Export JSON", exact=True)).to_be_disabled()
        page.get_by_label("Operator capability", exact=True).fill(token())
        page.get_by_role("button", name="Connect", exact=True).click()
        expect(page.get_by_role("button", name="Export JSON", exact=True)).to_be_enabled()
        page.get_by_role("button", name="Dismiss notification", exact=True).click()
        expect(page.get_by_role("region", name="Loaded events in loaded window", exact=True).locator("strong")).to_have_text(str(len(events)))
        for source, count in counts.items():
            expect(page.get_by_role("region", name=source.title() + " events in loaded window", exact=True).locator("strong")).to_have_text(str(count))
        expect(page.get_by_role("navigation", name="Main navigation").get_by_role("link", name="Activity Logs", exact=True)).to_have_attribute("aria-current", "page")
        inspector = page.get_by_role("region", name="Selected event details", exact=True)
        assert json.loads(inspector.locator("pre").inner_text()) == events[0]
        expect(inspector.locator("img")).to_have_count(0)
        for width, height in [(1366, 900), (1600, 1000), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            page.evaluate("document.fonts.ready")
            page.evaluate("window.scrollTo(0, 0)")
            overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            assert not overflow, f"Horizontal overflow at {width}"
            assert page.locator(".sidebar").bounding_box()["width"] == 288
            cards = page.locator(".activity-metrics > section")
            assert cards.nth(0).bounding_box()["y"] == cards.nth(4).bounding_box()["y"]
            assert page.locator(".activity-feed").bounding_box()["x"] < page.locator(".activity-sidebar").bounding_box()["x"]
            page.screenshot(path=OUTPUT / f"activity-{width}.png", full_page=True)
            viewports.append({"width": width, "height": height, "horizontal_overflow": overflow, "five_window_metrics_one_row": True, "feed_and_inspector_columns": True})
            print(f"Captured Activity Logs at {width}px", flush=True)
        if len(events) > 1:
            page.get_by_role("button", name=f"Inspect {events[1]['source']} event {events[1]['id']}", exact=True).focus()
            page.get_by_role("button", name=f"Inspect {events[1]['source']} event {events[1]['id']}", exact=True).press("Enter")
            assert json.loads(inspector.locator("pre").inner_text()) == events[1]
        if len(events) > 6:
            page.get_by_role("button", name="Next", exact=True).click()
            expect(page.get_by_text(f"Page 2 / {(len(events) + 5) // 6}", exact=True)).to_be_visible()
            assert json.loads(inspector.locator("pre").inner_text()) == events[6]
            page.get_by_role("button", name="Previous", exact=True).click()
        selected_source = max(counts, key=counts.get)
        page.get_by_label("Event source", exact=True).select_option(selected_source)
        filtered = [event for event in events if event["source"] == selected_source]
        expect(page.locator(".activity-event-list > li")).to_have_count(min(6, len(filtered)))
        expect(page.get_by_role("region", name="Loaded events in loaded window", exact=True).locator("strong")).to_have_text(str(len(events)))
        with page.expect_download() as pending:
            page.get_by_role("button", name="Export JSON", exact=True).click()
        exported_text = Path(pending.value.path()).read_text(encoding="utf-8")
        assert token() not in exported_text
        exported = json.loads(exported_text)
        assert exported["scope"] == "filtered_recent_window"
        assert exported["events"] == filtered
        assert exported["loaded_event_count"] == len(events) and exported["exported_event_count"] == len(filtered)
        assert all(set(event) == {"id", "source", "event_type", "timestamp"} for event in exported["events"])
        with page.expect_download() as pending:
            page.get_by_role("button", name="Export CSV", exact=True).click()
        csv_text = Path(pending.value.path()).read_text(encoding="utf-8")
        assert token() not in csv_text
        assert list(csv.DictReader(io.StringIO(csv_text))) == filtered
        selected_type = filtered[0]["event_type"]
        page.get_by_label("Event type", exact=True).select_option(selected_type)
        expected_count = sum(event["event_type"] == selected_type for event in filtered)
        expect(page.locator(".activity-event-list > li")).to_have_count(min(6, expected_count))
        page.get_by_label("Search activity events", exact=True).fill("no-such-qa-event")
        expect(page.get_by_role("heading", name="No events match these filters", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Copy JSON", exact=True)).to_have_count(0)
        page.get_by_role("button", name="Reset", exact=True).click()
        page.get_by_label("Search activity events", exact=True).fill(events[0]["id"])
        expect(page.locator(".activity-event-list > li")).to_have_count(1)
        page.get_by_role("button", name="Reset", exact=True).click()
        page.get_by_label("Event time window", exact=True).select_option("24h")
        now_ms = page.evaluate("Date.now()")
        recent = [event for event in events if 0 <= now_ms - datetime.fromisoformat(event["timestamp"]).timestamp() * 1000 <= 86400000]
        expect(page.locator(".activity-event-list > li")).to_have_count(min(6, len(recent)))
        page.get_by_role("button", name="Reset", exact=True).click()
        page.get_by_role("button", name="Compact view", exact=True).click()
        expect(page.get_by_role("button", name="Compact view", exact=True)).to_have_attribute("aria-pressed", "true")
        selected_metadata = inspector.locator("pre").inner_text()
        page.get_by_role("button", name="Copy JSON", exact=True).click()
        expect(page.get_by_text("Event metadata copied", exact=True)).to_be_visible()
        # Windows may normalize clipboard line endings; compare the JSON record.
        assert json.loads(page.evaluate("navigator.clipboard.readText()")) == json.loads(selected_metadata)
        page.get_by_role("button", name="Pause auto-refresh", exact=True).click()
        expect(page.get_by_role("button", name="Refresh", exact=True)).to_be_enabled()
        feed_status = page.get_by_role("region", name="Feed scope and refresh", exact=True)
        expect(feed_status).to_contain_text("Auto-refresh paused")
        read_time = feed_status.locator("dl > div").nth(2).locator("dd")
        paused_time = read_time.inner_text()
        page.wait_for_timeout(6000)
        expect(read_time).to_have_text(paused_time)
        page.get_by_role("button", name="Refresh", exact=True).click()
        expect(page.get_by_role("button", name="Refresh", exact=True)).to_be_enabled()
        expect(read_time).not_to_have_text(paused_time)
        page.get_by_role("button", name="Resume auto-refresh", exact=True).click()
        expect(feed_status).to_contain_text("Auto-refresh every 5s")
        page.reload()
        expect(page.get_by_role("heading", name="Connect to inspect persisted activity", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Export JSON", exact=True)).to_be_disabled()
        expect(page.get_by_role("button", name="Copy JSON", exact=True)).to_have_count(0)
        after = context.request.get("http://localhost:8001/api/inventory").json()
        flags_after = context.request.get(BASE + "/api/v1/capabilities").json()
        assert before == after and flags == flags_after
        assert not errors, errors
        assert not mutations, mutations
        browser.close()
    result = {"generated_at": datetime.now(UTC).isoformat(), "target": BASE, "source": "Real protected persisted recent-event metadata; no payloads or screenshots invented", "loaded_events": len(events), "source_counts": counts, "viewports": viewports, "checks": ["operator access before protected event display", "five counters scoped to the loaded window", "keyboard inspection of exact event metadata", "local six-event pagination", "source/type/text/time filters preserve loaded counters", "filtered-window JSON and formula-safe CSV export", "selected metadata clipboard copy", "compact presentation", "view auto-refresh pause stays frozen while shell remains active", "manual refresh while paused and resume", "capability cleared on reload"], "http_mutations": mutations, "page_errors": errors, "meta_calls": 0, "inventory_unchanged": before == after, "server_flags_unchanged": flags == flags_after, "limitations": "Missing/failed sources and empty windows use labeled unit fixtures. The endpoint is a bounded recent window, not a complete immutable audit history; entry payload/frame/severity/signature are not supplied."}
    (ROOT / "docs/evidence/activity-design-ui.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "loaded_events": len(events), "mutations": mutations, "page_errors": errors}))


if __name__ == "__main__":
    main()
