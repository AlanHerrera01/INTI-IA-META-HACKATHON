"""Read-only deployed model-card checks; never submits a calibration."""

import json
from pathlib import Path

import httpx
from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    status = httpx.get("http://127.0.0.1:8000/api/v1/models/status").json()
    metrics = status["measurements"]
    writes, errors = [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1600, "height": 1100})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "request",
                lambda request: (
                    writes.append(request.url) if request.method == "POST" else None
                ),
            )
            page.goto("http://127.0.0.1:5173")
            page.get_by_label("Idioma / Language").select_option("en")
            page.get_by_label("Operator capability").fill(token())
            page.get_by_role("button", name="Connect", exact=True).click()
            expect(
                page.locator(".overview-runtime-row").filter(has_text=status["model"])
            ).to_contain_text("Access verified")
            page.locator('.sidebar-navigation a[href="/models"]').click()
            expect(page.locator(".models-metrics")).to_contain_text(
                f"{metrics['mean_latency_ms']:.0f} ms"
            )
            expect(page.locator(".models-metrics")).to_contain_text(
                f"{metrics['output_tokens_per_second']:.2f} tok/s"
            )
            expect(page.locator(".native-model-calibration")).to_contain_text(
                "One sample is not a benchmark."
            )
            expect(
                page.get_by_role("button", name="Run one real calibration")
            ).to_be_enabled()
            for language in ("en", "es"):
                page.get_by_label("Idioma / Language").select_option(language)
                for width in (1366, 1600, 1920):
                    page.set_viewport_size({"width": width, "height": 1100})
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= innerWidth"
                    )
                page.set_viewport_size({"width": 1600, "height": 1100})
                output = ROOT / "docs/screenshots/models"
                output.mkdir(parents=True, exist_ok=True)
                page.screenshot(
                    path=output / f"measured-{language}.png", full_page=True
                )
            assert not writes, writes
            assert not errors, errors
        finally:
            browser.close()
    after = httpx.get("http://127.0.0.1:8000/api/v1/models/status").json()[
        "measurements"
    ]
    assert after["attempts"] == metrics["attempts"], (
        "Inspection must not call the model"
    )
    (ROOT / "docs/evidence/models-measurements-ui.json").write_text(
        json.dumps(
            {"metrics": metrics, "page_errors": errors, "write_requests": writes},
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        "Measured model cards verified in English/Spanish at three desktop widths; no new calls."
    )


if __name__ == "__main__":
    main()
