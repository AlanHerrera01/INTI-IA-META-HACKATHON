"""Read-only Settings QA, including transient access and credential-free export."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("INTI_WEB_URL", "http://localhost:5173")
OUTPUT = ROOT / "docs/screenshots/settings"


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
        model = context.request.get(BASE + "/api/v1/models/status").json()
        flags = context.request.get(BASE + "/api/v1/capabilities").json()
        system = context.request.get(BASE + "/api/v1/system/status").json()
        page.goto(BASE + "/system")
        expect(page.get_by_role("heading", name="System Settings & Platform Configuration", exact=True)).to_be_visible()
        expect(page.get_by_role("navigation", name="Main navigation").get_by_role("link", name="Settings", exact=True)).to_have_attribute("aria-current", "page")
        expect(page.get_by_role("button", name="Export diagnostics", exact=True)).to_be_enabled()
        vision = page.get_by_role("region", name="AI vision and grounding configuration", exact=True)
        expect(vision).to_contain_text(model["model"])
        expect(vision).to_contain_text("Configured" if model["configured"] else "Not configured")
        switches = page.get_by_label("Server feature switches", exact=True).locator(":scope > div")
        for index, key in enumerate(["model_calls_enabled", "execution_enabled", "verification_enabled", "recovery_enabled"]):
            expect(switches.nth(index).locator(".settings-state")).to_have_text("Enabled" if flags[key] else "Disabled")
        apps = page.get_by_role("region", name="Connected applications", exact=True)
        expect(apps).to_contain_text("Reachable")
        expect(apps.locator(".settings-app-facts > div").first.locator("dd")).to_have_text(str(len(before)))
        expect(page.get_by_role("slider")).to_have_count(0)
        expect(page.get_by_role("button", name="Save Changes", exact=True)).to_have_count(0)
        expect(page.get_by_role("button", name="HALT NOW", exact=True)).to_have_count(0)
        capability = page.get_by_label("Operator capability", exact=True)
        expect(capability).to_have_attribute("type", "password")
        capability.fill(token())
        page.get_by_role("button", name="Load capability", exact=True).click()
        expect(capability).to_have_value("")
        expect(page.get_by_text("CAPABILITY LOADED", exact=True)).to_be_visible()
        assert page.evaluate("secret => !JSON.stringify(localStorage).includes(secret) && !JSON.stringify(sessionStorage).includes(secret)", token())
        assert token() not in page.url
        navigation = page.get_by_role("navigation", name="Settings sections", exact=True)
        module_regions = [("General & Access", "Local operator access"), ("Vision & AI Models", "AI vision and grounding configuration"), ("Connected Apps", "Connected applications"), ("Sandbox & Services", "Sandbox services and API configuration")]
        for label, region in module_regions:
            navigation.get_by_role("button", name=label, exact=True).click()
            expect(navigation.get_by_role("button", name=label, exact=True)).to_have_attribute("aria-pressed", "true")
            expect(page.get_by_role("region", name=region, exact=True)).to_be_visible()
            for _, other in module_regions:
                if other != region:
                    expect(page.get_by_role("region", name=other, exact=True)).to_have_count(0)
        navigation.get_by_role("button", name="All Modules", exact=True).click()
        expect(page.get_by_text("CAPABILITY LOADED", exact=True)).to_be_visible()
        for width, height in [(1366, 900), (1600, 1000), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            page.evaluate("document.fonts.ready")
            page.evaluate("window.scrollTo(0, 0)")
            overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            assert not overflow, f"Horizontal overflow at {width}"
            assert page.locator(".sidebar").bounding_box()["width"] == 288
            assert page.locator(".settings-aside").bounding_box()["x"] < page.locator(".settings-main").bounding_box()["x"]
            sandbox = page.locator(".settings-sandbox").bounding_box()
            assert abs(sandbox["width"] - page.locator(".settings-body").bounding_box()["width"]) < 2
            page.screenshot(path=OUTPUT / f"settings-{width}.png", full_page=True)
            viewports.append({"width": width, "height": height, "horizontal_overflow": overflow, "profile_and_configuration_columns": True, "full_width_sandbox": True})
            print(f"Captured Settings at {width}px", flush=True)
        with page.expect_download() as pending:
            page.get_by_role("button", name="Export diagnostics", exact=True).click()
        exported_text = Path(pending.value.path()).read_text(encoding="utf-8")
        assert token() not in exported_text
        exported = json.loads(exported_text)
        assert exported["model"] == {key: model[key] for key in ["provider", "model", "configured", "available"]}
        assert exported["system"] == system
        assert exported["capabilities"] == {key: flags[key] for key in ["model_calls_enabled", "execution_enabled", "verification_enabled", "recovery_enabled"]}
        assert exported["inventory"] == {"reachable": True, "record_count": len(before)}
        assert set(exported) == {"downloaded_at", "model", "system", "capabilities", "inventory", "source_read_times"}
        page.get_by_role("button", name="Check connection", exact=True).click()
        expect(page.get_by_role("button", name="Check connection", exact=True)).to_be_enabled()
        page.get_by_role("button", name="Refresh diagnostics", exact=True).click()
        expect(page.get_by_role("button", name="Export diagnostics", exact=True)).to_be_enabled()
        page.get_by_text("Local configuration guide", exact=True).click()
        expect(page.get_by_role("link", name="Open API documentation", exact=True)).to_have_attribute("href", "http://localhost:8000/docs")
        page.get_by_role("link", name="Review AI Models", exact=True).click()
        expect(page.get_by_role("heading", name="AI Models & Multi-Modal Engines", exact=True)).to_be_visible()
        page.go_back()
        expect(page.get_by_text("CAPABILITY LOADED", exact=True)).to_be_visible()
        page.get_by_role("button", name="Disconnect", exact=True).click()
        expect(page.get_by_text("NOT CONNECTED", exact=True)).to_be_visible()
        capability.fill(token())
        page.get_by_role("button", name="Load capability", exact=True).click()
        expect(page.get_by_text("CAPABILITY LOADED", exact=True)).to_be_visible()
        page.reload()
        expect(page.get_by_text("NOT CONNECTED", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Disconnect", exact=True)).to_be_disabled()
        after = context.request.get("http://localhost:8001/api/inventory").json()
        flags_after = context.request.get(BASE + "/api/v1/capabilities").json()
        model_after = context.request.get(BASE + "/api/v1/models/status").json()
        assert before == after and flags == flags_after and model == model_after
        assert not mutations, mutations
        assert not errors, errors
        browser.close()
    result = {"generated_at": datetime.now(UTC).isoformat(), "target": BASE, "source": "Real local status, capability switches and inventory catalog; operator capability used only in transient browser memory", "model": model["model"], "model_configured": model["configured"], "model_calls_enabled": flags["model_calls_enabled"], "inventory_record_count": len(before), "viewports": viewports, "checks": ["all five module filters", "real configuration and dependency states", "memory-only operator capability and cleared password input", "explicit public JSON export excludes credentials", "independent inventory connection check", "read-only diagnostic refresh", "AI Models and API documentation links", "access retained on route navigation and cleared on reload", "unsupported save, sliders and global halt omitted"], "http_mutations": mutations, "page_errors": errors, "meta_calls": 0, "inventory_unchanged": before == after, "model_configuration_unchanged": flags == flags_after and model == model_after, "limitations": "Failed sources and tristate model availability use labeled unit fixtures. No server configuration, inventory or execution is changed."}
    (ROOT / "docs/evidence/settings-design-ui.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "mutations": mutations, "page_errors": errors, "configuration_unchanged": True}))


if __name__ == "__main__":
    main()
