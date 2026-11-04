"""Read-only Analytics QA over archived reports; never runs evaluation harnesses."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://localhost:5173")
OUTPUT = ROOT / "docs/screenshots/analytics"


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
        response = context.request.get(BASE + "/api/v1/benchmarks")
        assert response.ok
        reports = response.json()
        verification = next(item for item in reports["items"] if item["report_id"] == "verification")
        policy = next(item for item in reports["items"] if item["report_id"] == "planning-policy")
        page.goto(BASE + "/benchmarks")
        expect(page.get_by_role("heading", name="Analytics & Benchmarks", exact=True)).to_be_visible()
        expect(page.get_by_role("navigation", name="Main navigation").get_by_role("link", name="Analytics & Benchmarks", exact=True)).to_have_attribute("aria-current", "page")
        expect(page.get_by_label("Evaluation source", exact=True)).to_have_value("verification")
        ratio = verification["data"]["verification_success_rate"]
        metric = page.get_by_role("region", name="Verified task success", exact=True)
        expect(metric).to_contain_text(f"{ratio['numerator'] / ratio['denominator'] * 100:.1f}%")
        expect(metric).to_contain_text(f"{ratio['numerator']} / {ratio['denominator']} recorded cases")
        expect(page.get_by_role("region", name="Verification latency · mean", exact=True)).to_contain_text(f"{verification['data']['mean_verification_latency_ms']:.1f} ms")
        expect(page.locator(".analytics-chart-bar")).to_have_count(len(verification["data"]["results"]))
        expect(page.get_by_role("button", name="Run Benchmark Suite", exact=True)).to_have_count(0)
        for width, height in [(1366, 900), (1600, 1000), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            page.evaluate("document.fonts.ready")
            page.evaluate("window.scrollTo(0, 0)")
            overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            assert not overflow, f"Horizontal overflow at {width}"
            assert page.locator(".sidebar").bounding_box()["width"] == 288
            cards = page.locator(".analytics-metrics > section")
            assert cards.nth(0).bounding_box()["y"] == cards.nth(3).bounding_box()["y"]
            assert page.locator(".analytics-chart-panel").bounding_box()["x"] < page.locator(".analytics-coverage").bounding_box()["x"]
            page.screenshot(path=OUTPUT / f"analytics-{width}.png", full_page=True)
            viewports.append({"width": width, "height": height, "horizontal_overflow": overflow, "four_metrics_one_row": True, "chart_and_coverage_columns": True})
            print(f"Captured Analytics at {width}px", flush=True)
        last = verification["data"]["results"][-1]
        sample = page.get_by_role("button", name="Inspect latency sample " + last["scenario"], exact=True)
        sample.focus()
        sample.press("Enter")
        expect(sample).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".analytics-chart-inspector")).to_contain_text(last["scenario"].replace("_", " "))
        page.get_by_label("Recorded outcome", exact=True).select_option(last["actual_verdict"])
        matching = sum(row["actual_verdict"] == last["actual_verdict"] for row in verification["data"]["results"])
        expect(page.locator(".analytics-results tbody tr")).to_have_count(matching)
        expect(metric).to_contain_text(f"{ratio['numerator']} / {ratio['denominator']} recorded cases")
        page.get_by_label("Search benchmark scenarios", exact=True).fill("no-such-qa-scenario")
        expect(page.get_by_text("No scenarios match these filters.", exact=True)).to_be_visible()
        page.get_by_label("Search benchmark scenarios", exact=True).fill("")
        page.get_by_label("Recorded outcome", exact=True).select_option("")
        page.get_by_role("button", name="Inspect scenario " + last["scenario"], exact=True).click()
        summary = page.get_by_text("Selected scenario record: " + last["scenario"].replace("_", " "), exact=True)
        summary.click()
        record = json.loads(page.locator(".analytics-record-inspector pre").inner_text())
        assert record == last
        with page.expect_download() as pending:
            page.get_by_role("button", name="Export report JSON", exact=True).click()
        assert json.loads(Path(pending.value.path()).read_text(encoding="utf-8")) == verification
        page.get_by_role("button", name="Copy source hash", exact=True).click()
        expect(page.get_by_text("Source hash copied", exact=True)).to_be_visible()
        assert page.evaluate("navigator.clipboard.readText()") == verification["sha256"]
        page.get_by_label("Evaluation source", exact=True).select_option("planning-policy")
        expect(page.get_by_role("region", name="Expected policy agreement", exact=True)).to_contain_text(f"{policy['data']['expected_outcome_match_rate'] * 100:.1f}%")
        expect(page.get_by_role("region", name="Verified task success", exact=True)).to_have_count(0)
        expect(page.locator(".analytics-results tbody tr")).to_have_count(len(policy["data"]["rows"]))
        expect(page.locator(".analytics-chart-bar")).to_have_count(len(policy["data"]["rows"]))
        expect(page.get_by_text("Policy fixture · not executed", exact=True)).to_have_count(len(policy["data"]["rows"]))
        page.screenshot(path=OUTPUT / "analytics-policy-1920.png", full_page=True)
        with page.expect_download() as pending:
            page.get_by_role("button", name="Export report JSON", exact=True).click()
        assert json.loads(Path(pending.value.path()).read_text(encoding="utf-8")) == policy
        page.get_by_role("button", name="Independent verification", exact=False).click()
        expect(page.get_by_label("Evaluation source", exact=True)).to_have_value("verification")
        page.get_by_role("button", name="Refresh reports", exact=True).click()
        expect(page.get_by_role("button", name="Export report JSON", exact=True)).to_be_enabled()
        page.reload()
        expect(page.get_by_role("heading", name="Analytics & Benchmarks", exact=True)).to_be_visible()
        expect(page.get_by_role("region", name="Verified task success", exact=True)).to_contain_text(f"{ratio['numerator']} / {ratio['denominator']} recorded cases")
        after = context.request.get("http://localhost:8001/api/inventory").json()
        flags_after = context.request.get(BASE + "/api/v1/capabilities").json()
        report_after = context.request.get(BASE + "/api/v1/benchmarks").json()
        assert before == after and flags == flags_after and reports == report_after
        assert not errors, errors
        assert not mutations, mutations
        browser.close()
    result = {"generated_at": datetime.now(UTC).isoformat(), "target": BASE, "source": "Actual allowlisted archived reports; no new benchmark execution", "reports": [{"id": item["report_id"], "sha256": item["sha256"], "declared_cases": item["data"].get("scenarios", item["data"].get("evaluated"))} for item in reports["items"]], "viewports": viewports, "checks": ["separate verifier and synthetic policy sources", "original report denominators and means", "discrete source-order latency samples", "keyboard sample selection", "outcome and text filters leave aggregate denominators unchanged", "original scenario JSON inspection", "selected report JSON export with source metadata", "copy source SHA-256 without certification claims", "read-only refresh and compiled-page reload"], "http_mutations": mutations, "page_errors": errors, "meta_calls": 0, "benchmark_runs_started": 0, "inventory_unchanged": before == after, "server_flags_unchanged": flags == flags_after, "archived_reports_unchanged": reports == report_after, "limitations": "Transient source failures, invalid/missing measurements and unavailable reports use labeled unit fixtures. These reports do not measure comparative model quality or recovery reliability."}
    (ROOT / "docs/evidence/analytics-design-ui.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "reports": len(reports["items"]), "mutations": mutations, "page_errors": errors, "benchmark_runs_started": 0}))


if __name__ == "__main__":
    main()
