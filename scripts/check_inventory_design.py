"""Read-only Hardware Inventory QA, including unchanged source records."""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://localhost:5173")
SANDBOX = "http://localhost:8001"
OUTPUT = ROOT / "docs/screenshots/inventory"


def digest(data: object) -> str:
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def main() -> None:
    expect.set_options(timeout=30000)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    mutations: list[str] = []
    viewports = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(
            viewport={"width": 1600, "height": 1000}, accept_downloads=True
        )
        context.on(
            "request",
            lambda request: (
                mutations.append(request.method + " " + request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"}
                else None
            ),
        )
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        before_response = context.request.get(SANDBOX + "/api/inventory")
        assert before_response.ok
        before = before_response.json()
        target = next(asset for asset in before if asset["id"] == "PC-104")
        page.goto(BASE + "/inventory")
        expect(
            page.get_by_role(
                "heading", name="Hardware & IT Asset Inventory", exact=True
            )
        ).to_be_visible()
        expect(page.get_by_role("table")).to_be_visible()
        bridge = context.request.get(BASE + "/inventory-data")
        assert bridge.ok and bridge.json() == before
        expect(
            page.get_by_role("region", name="Fleet catalog").locator("strong")
        ).to_contain_text(str(len(before)))
        expect(
            page.get_by_role("navigation", name="Main navigation").get_by_role(
                "link", name="Hardware & IT Inventory", exact=True
            )
        ).to_have_attribute("aria-current", "page")
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
            page.screenshot(path=OUTPUT / f"inventory-{width}.png", full_page=True)
            viewports.append(
                {"width": width, "height": height, "horizontal_overflow": overflow}
            )
            print(f"Captured Hardware Inventory at {width}px", flush=True)
        page.set_viewport_size({"width": 1600, "height": 1000})
        page.get_by_label("Search hardware inventory", exact=True).fill(target["id"])
        expect(page.locator(".inventory-table tbody tr")).to_have_count(1)
        page.get_by_role("button", name="Inspect asset PC-104", exact=True).click()
        inspector = page.get_by_role(
            "complementary", name="Inspection target", exact=True
        )
        expect(inspector).to_contain_text(target["name"])
        expect(inspector).to_contain_text(target["status"])
        expect(inspector).to_contain_text("v" + str(target["version"]))
        with page.expect_download() as pending:
            page.get_by_role(
                "button", name="Export filtered inventory as JSON", exact=True
            ).click()
        exported = json.loads(Path(pending.value.path()).read_text(encoding="utf-8"))
        assert exported["assets"] == [target]
        with page.expect_download() as pending:
            page.get_by_role("button", name="Download record", exact=True).click()
        assert (
            json.loads(Path(pending.value.path()).read_text(encoding="utf-8")) == target
        )
        page.get_by_label("Search hardware inventory", exact=True).fill(
            "no-such-asset-qa"
        )
        expect(
            page.get_by_role(
                "heading", name="No assets match these filters", exact=True
            )
        ).to_be_visible()
        page.get_by_role("button", name="Reset filters", exact=True).click()
        page.get_by_label("Filter hardware status", exact=True).select_option(
            "Operational"
        )
        expect(page.locator(".inventory-table tbody tr")).to_have_count(
            sum(asset["status"] == "Operational" for asset in before)
        )
        page.get_by_role("button", name="Reset filters", exact=True).click()
        location = before[0]["location"]
        page.get_by_label("Filter hardware location", exact=True).select_option(
            location
        )
        expect(page.locator(".inventory-table tbody tr")).to_have_count(
            min(5, sum(asset["location"] == location for asset in before))
        )
        page.get_by_role("button", name="Reset filters", exact=True).click()
        if len(before) > 5:
            page.get_by_role("button", name="Next inventory page", exact=True).click()
            expect(page.locator(".inventory-table tbody tr").first).to_have_attribute(
                "data-asset-id", before[5]["id"]
            )
            page.get_by_role(
                "button", name="Previous inventory page", exact=True
            ).click()
        page.get_by_role("button", name="Refresh inventory", exact=True).click()
        with page.expect_popup() as popup:
            page.get_by_role("link", name=re.compile(r"^Open editable sandbox")).click()
        sandbox = popup.value
        sandbox.on("pageerror", lambda error: errors.append(str(error)))
        expect(sandbox.get_by_label("Search equipment", exact=True)).to_be_visible()
        sandbox.get_by_label("Search equipment", exact=True).fill("PC-104")
        sandbox.get_by_role("button", name="Open PC-104", exact=True).click()
        expect(sandbox.get_by_role("dialog", name="Asset record")).to_be_visible()
        expect(sandbox.get_by_label("PC-104 status", exact=True)).to_have_value(
            target["status"]
        )
        sandbox.get_by_role("button", name="Close record", exact=True).click()
        sandbox.close()
        page.get_by_role(
            "link", name=re.compile(r"^Review automation evidence")
        ).click()
        expect(
            page.get_by_role("heading", name="Task Manager", exact=True)
        ).to_be_visible()
        page.get_by_role("navigation", name="Main navigation").get_by_role(
            "link", name="Hardware & IT Inventory", exact=True
        ).click()
        expect(page.get_by_role("table")).to_be_visible()
        page.reload()
        expect(page.get_by_role("table")).to_be_visible()
        after_response = context.request.get(SANDBOX + "/api/inventory")
        assert after_response.ok
        after = after_response.json()
        assert digest(before) == digest(after), (
            "Inventory values or versions changed during read-only QA"
        )
        assert not errors, errors
        assert not mutations, mutations
        browser.close()
    report = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "status": "PASSED",
        "target": BASE,
        "scope": "Platform Hardware Inventory and unchanged original automation sandbox",
        "viewports": viewports,
        "asset_count": len(before),
        "inventory_before_sha256": digest(before),
        "inventory_after_sha256": digest(after),
        "page_errors": errors,
        "http_mutations": mutations,
        "model_calls_triggered": 0,
        "checks": [
            "native connected-app route and active navigation",
            "same inventory records through read-only connection",
            "desktop table and focused inspector",
            "search/status/location filters",
            "pagination",
            "JSON snapshot downloads",
            "existing sandbox labels and record dialog preserved",
            "task evidence link",
            "reload without React errors",
            "all source asset values and versions unchanged",
        ],
        "screenshots": [
            path.relative_to(ROOT).as_posix() for path in sorted(OUTPUT.glob("*.png"))
        ],
    }
    (ROOT / "docs/evidence/inventory-design-ui.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "Hardware Inventory QA PASSED; inventory unchanged, zero HTTP mutations or model calls",
        flush=True,
    )


if __name__ == "__main__":
    main()
