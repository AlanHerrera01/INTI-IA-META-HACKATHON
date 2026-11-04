"""Read-only visual/layout checks of the original tab compositions on the local runtime."""

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGES = [
    ("/", "overview", ".overview-columns", ".overview-stat-grid > section", 4),
    ("/planning", "studio", ".studio-layout", ".studio-aside > section", 3),
    (
        "/execution",
        "execution",
        ".live-command-layout",
        ".live-right-column > section",
        4,
    ),
    (
        "/observations",
        "observations",
        ".observations-split",
        ".observations-panels > section",
        3,
    ),
    ("/tasks", "tasks", ".task-manager-layout", ".task-manager-metrics > section", 3),
    ("/inventory", "hardware", ".inventory-layout", ".inventory-metrics > section", 3),
    (
        "/recovery",
        "recovery",
        ".recovery-comparison-grid",
        ".recovery-center-metrics > section",
        4,
    ),
    (
        "/verification",
        "verification",
        ".verification-proof-grid",
        ".verification-lab-metrics > section",
        3,
    ),
    (
        "/benchmarks",
        "analytics",
        ".analytics-analysis-grid",
        ".analytics-metrics > section",
        4,
    ),
    ("/models", "models", ".models-layout", ".models-metrics > section", 4),
    ("/activity", "activity", ".activity-layout", ".activity-metrics > section", 5),
    ("/system", "settings", ".settings-body", ".settings-module-nav > button", 5),
    (
        "/missions/new",
        "mission",
        ".mission-columns",
        ".overview-metrics > .overview-metric",
        4,
    ),
]


def main() -> None:
    output = ROOT / "docs/screenshots/restored-local-designs"
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    writes = []
    api_paths = set()
    checks = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1600, "height": 1100})
            page.on("pageerror", lambda error: errors.append(str(error)))

            def inspect_request(request):
                path = urlsplit(request.url).path
                if path.startswith("/api/"):
                    api_paths.add(path)
                    if request.method not in {"GET", "HEAD", "OPTIONS"}:
                        writes.append(path)

            page.on("request", inspect_request)
            page.goto(os.environ.get("INTI_WEB_URL", "http://127.0.0.1:5173"))
            page.get_by_label("Idioma / Language").select_option("en")
            page.get_by_label("Operator capability").fill(token())
            page.get_by_role("button", name="Connect", exact=True).click()
            expect(page.locator(".sidebar-navigation a")).to_have_count(15)
            for route, name, layout, metric_selector, count in PAGES:
                if route == "/missions/new":
                    page.locator(".topbar-new-task").click()
                else:
                    page.locator(f'.sidebar-navigation a[href="{route}"]').click()
                expect(page.locator(".native-design-page")).to_be_visible()
                expect(page.locator("main h1")).to_be_visible()
                expect(page.locator(metric_selector)).to_have_count(count)
                expect(page.locator(layout)).to_be_visible()
                if name == "hardware":
                    expect(page.locator("main h1")).to_have_text("Computers & Applications")
                    expect(page.locator(".native-device-applications")).to_be_visible()
                    expect(page.get_by_label("Application computer")).to_be_visible()
                assert page.locator(".local-workflow").count() == 0
                for width in (1366, 1600, 1920):
                    page.set_viewport_size({"width": width, "height": 1100})
                    page.wait_for_timeout(250)
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= innerWidth"
                    ), f"Overflow {name} {width}"
                    columns = page.locator(layout).evaluate(
                        "el => getComputedStyle(el).gridTemplateColumns"
                    )
                    checks.append(
                        {
                            "page": name,
                            "width": width,
                            "columns": columns,
                            "overflow": False,
                        }
                    )
                    if width == 1600:
                        page.evaluate("window.scrollTo(0,0)")
                        page.screenshot(
                            path=output / f"{name}-en-1600.png", full_page=True
                        )
                page.get_by_label("Idioma / Language").select_option("es")
                page.set_viewport_size({"width": 1366, "height": 1100})
                page.wait_for_timeout(200)
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= innerWidth"
                ), f"Spanish overflow {name}"
                page.set_viewport_size({"width": 1600, "height": 1100})
                page.evaluate("window.scrollTo(0,0)")
                page.screenshot(path=output / f"{name}-es-1600.png", full_page=True)
                page.get_by_label("Idioma / Language").select_option("en")
            assert not errors, errors
            assert not writes, writes
            assert not any(
                path.startswith(
                    (
                        "/api/v1/missions",
                        "/api/v1/executions",
                        "/api/v1/verifications",
                        "/api/v1/recoveries",
                        "/api/inventory",
                    )
                )
                for path in api_paths
            )
        finally:
            browser.close()
    (ROOT / "docs/evidence/restored-local-designs.json").write_text(
        json.dumps(
            {
                "checks": checks,
                "page_errors": errors,
                "write_requests": writes,
                "api_paths": sorted(api_paths),
                "original_compositions_restored": True,
                "runtime": "paired_local_computer",
                "reference_directory": "docs/screenshots",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        "All 12 tabs and Mission Control verified with local data in English and Spanish."
    )


if __name__ == "__main__":
    main()
