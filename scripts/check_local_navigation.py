"""Read-only browser validation of every original section against the local runtime."""

import json
from pathlib import Path
from urllib.parse import urlsplit

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ROUTES = [
    "/",
    "/planning",
    "/execution",
    "/observations",
    "/tasks",
    "/inventory",
    "/recovery",
    "/verification",
    "/benchmarks",
    "/models",
    "/activity",
    "/system",
    "/computer",
    "/computer/tasks",
    "/computer/permissions",
]


def main() -> None:
    errors = []
    writes = []
    api_paths = set()
    visited = []
    output = ROOT / "docs/screenshots/local-workflow"
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1600, "height": 1100})
            page.on("pageerror", lambda error: errors.append(str(error)))

            def request_seen(request):
                path = urlsplit(request.url).path
                if path.startswith("/api/"):
                    api_paths.add(path)
                    if request.method not in {"GET", "HEAD", "OPTIONS"}:
                        writes.append(path)

            page.on("request", request_seen)
            page.goto("http://127.0.0.1:5173/")
            page.get_by_label("Credencial de operador").fill(token())
            page.get_by_role("button", name="Conectar", exact=True).click()
            expect(page.locator(".sidebar-navigation a")).to_have_count(15)
            for route in ROUTES:
                page.locator(f'.sidebar-navigation a[href="{route}"]').click()
                page.wait_for_timeout(500)
                assert urlsplit(page.url).path == route, f"Route redirected: {route}"
                expect(page.locator("main h1")).to_be_visible()
                assert (
                    page.get_by_text(
                        "This workspace could not render.", exact=False
                    ).count()
                    == 0
                )
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= innerWidth"
                )
                visited.append(
                    {"route": route, "heading": page.locator("main h1").inner_text()}
                )
                if route in {"/", "/verification", "/recovery", "/execution"}:
                    page.evaluate("window.scrollTo(0,0)")
                    page.screenshot(
                        path=output / ((route.strip("/") or "overview") + "-es.png"),
                        full_page=True,
                    )
            for language in ("es", "en"):
                page.get_by_label("Idioma / Language").select_option(language)
                for width in (1366, 1600, 1920):
                    page.set_viewport_size({"width": width, "height": 1100})
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= innerWidth"
                    )
                page.locator('.sidebar-navigation a[href="/"]').click()
                expect(page.locator("main h1")).to_have_text(
                    "Vista general" if language == "es" else "Overview"
                )
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
    (ROOT / "docs/evidence/local-workflow-navigation.json").write_text(
        json.dumps(
            {
                "visited": visited,
                "page_errors": errors,
                "write_requests": writes,
                "api_paths": sorted(api_paths),
                "original_navigation_preserved": True,
                "runtime": "paired_local_computer",
                "demo_services_used": False,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        "All 12 original sections plus 3 computer routes verified on the local agent runtime."
    )


if __name__ == "__main__":
    main()
