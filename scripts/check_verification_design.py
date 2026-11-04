"""Read-only Verification Lab UI checks against persisted local records."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://localhost:5173")
OUTPUT = ROOT / "docs/screenshots/verification"


def main() -> None:
    expect.set_options(timeout=30000)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    mutations: list[str] = []
    viewports = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 1600, "height": 1000}, accept_downloads=True)
        context.on("request", lambda request: mutations.append(request.method + " " + request.url) if request.method not in {"GET", "HEAD", "OPTIONS"} else None)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        before = context.request.get("http://localhost:8001/api/inventory").json()
        history_response = context.request.get(BASE + "/api/v1/verifications?limit=20", headers={"Authorization": "Bearer " + token()})
        assert history_response.ok
        history = history_response.json()
        assert history["items"], "This read-only check requires an existing verification"
        latest = history["items"][0]
        identifier = latest["session"]["id"]
        execution = latest["session"]["execution_id"]
        page.goto(BASE + f"/verification?verification={identifier}&execution={execution}")
        expect(page.get_by_role("heading", name="Verification Lab", exact=True)).to_be_visible()
        expect(page.locator(".verdict-pass")).to_have_count(0)
        page.get_by_label("Operator token", exact=True).fill(token())
        page.get_by_role("button", name="Connect", exact=True).click()
        expect(page.get_by_role("heading", name="Execution vs verification", exact=True)).to_be_visible()
        expect(page.get_by_label("Selected verification", exact=True)).to_have_value(identifier)
        real_report_response = context.request.get(BASE + f"/api/v1/verifications/{identifier}/report", headers={"Authorization": "Bearer " + token()})
        assert real_report_response.ok
        real_report = real_report_response.json()
        expect(page.locator(".verdict-badge").first).to_have_text(real_report["effective_verdict"] or "NOT VERIFIED")
        expect(page.get_by_role("region", name="Criteria assertions", exact=True).locator("strong")).to_have_text(str(len(latest["criteria_version"]["criteria"])))
        expect(page.get_by_role("region", name="Evidence collected", exact=True).locator("strong")).to_have_text(str(len(latest["evidence"])))
        expect(page.locator(".verification-proof-grid img")).to_be_visible()
        assert page.locator(".verification-proof-grid img").evaluate("image => image.complete && image.naturalWidth > 0")
        for width, height in [(1366, 900), (1600, 1000), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            page.evaluate("document.fonts.ready")
            page.evaluate("window.scrollTo(0, 0)")
            overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            assert not overflow, f"Horizontal overflow at {width}"
            assert page.locator(".sidebar").bounding_box()["width"] == 288
            proof = page.locator(".verification-proof-grid > div")
            assert proof.nth(0).bounding_box()["x"] < proof.nth(1).bounding_box()["x"]
            page.screenshot(path=OUTPUT / f"verification-{width}.png", full_page=True)
            viewports.append({"width": width, "height": height, "horizontal_overflow": overflow})
            print(f"Captured Verification Lab at {width}px", flush=True)
        with page.expect_download() as pending:
            page.get_by_role("button", name="Download JSON", exact=True).click()
        exported = json.loads(Path(pending.value.path()).read_text(encoding="utf-8"))
        assert exported["verification_id"] == identifier
        assert exported["effective_verdict"] == real_report["effective_verdict"]
        assert token() not in json.dumps(exported)
        database = page.locator(".verification-evidence-list button").filter(has_text="DATABASE_STATE").first
        database.click()
        expect(page.locator(".verification-json")).to_be_visible()
        assert json.loads(page.locator(".verification-json").inner_text())
        if len(history["items"]) > 1:
            other = history["items"][1]["session"]["id"]
            page.get_by_label("Selected verification", exact=True).select_option(other)
            expect(page.get_by_label("Selected verification", exact=True)).to_have_value(other)
            expect(page.get_by_role("button", name="Download JSON", exact=True)).to_be_visible()
            page.get_by_role("button", name=f"Inspect {identifier}", exact=True).click()
            expect(page.get_by_label("Selected verification", exact=True)).to_have_value(identifier)
        page.get_by_role("button", name="Recheck evidence integrity", exact=True).click()
        expect(page.get_by_role("button", name="Recheck evidence integrity", exact=True)).to_be_enabled()
        page.reload()
        expect(page.get_by_label("Operator token", exact=True)).to_be_visible()
        expect(page.locator(".verdict-pass")).to_have_count(0)
        expect(page.locator(".verification-proof-grid img")).to_have_count(0)
        after = context.request.get("http://localhost:8001/api/inventory").json()
        assert before == after, "Inventory changed during read-only QA"
        assert not mutations, mutations
        assert not errors, errors
        browser.close()
    result = {"generated_at": datetime.now(UTC).isoformat(), "target": BASE, "source": "Real persisted records and protected artifacts; no model fixtures in browser QA", "verification_count": history["total"], "inspected_verification": identifier, "effective_verdict": real_report["effective_verdict"], "integrity_checks": len(real_report["integrity_checks"]), "viewports": viewports, "checks": ["execution and verification deep link survives connection", "real protected screenshot and database JSON", "report JSON export", "history selection and ledger inspection", "read-only integrity recheck", "capability cleared on reload"], "http_mutations": mutations, "page_errors": errors, "meta_calls": 0, "inventory_unchanged": before == after, "limitations": "Cancellation, fresh collection and transient failure states exercised with labeled unit fixtures; browser checks never create records."}
    (ROOT / "docs/evidence/verification-design-ui.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "verification_count": history["total"], "page_errors": errors, "mutations": mutations}))


if __name__ == "__main__":
    main()
