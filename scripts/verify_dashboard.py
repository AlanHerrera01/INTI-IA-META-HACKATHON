"""Real UI acceptance test. Requires a running full stack; writes local evidence."""

import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect


async def main() -> None:
    output = Path("artifacts/verification")
    output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            await page.goto("http://127.0.0.1:5173/", wait_until="networkidle")
            await page.get_by_role("heading", name="Observation console.").wait_for()
            old_source = (
                await page.locator(".screenshot-frame img").get_attribute("src")
                if await page.locator(".screenshot-frame img").count()
                else None
            )
            await page.get_by_role(
                "button", name="Capture observation", exact=True
            ).click()
            await expect(
                page.get_by_role("button", name="Capture observation", exact=True)
            ).to_be_enabled(timeout=60000)
            image = page.get_by_alt_text("Captured INTI Inventory", exact=False)
            await image.wait_for(timeout=60000)
            assert await image.get_attribute("src") != old_source, (
                "Capture must produce a new record"
            )
            await page.wait_for_function(
                "Array.from(document.images).some(i => i.alt.startsWith('Captured ') "
                "&& i.complete && i.naturalWidth > 0)"
            )
            await page.screenshot(
                path=str(output / "dashboard-desktop.png"), full_page=True
            )
            await page.reload(wait_until="networkidle")
            await image.wait_for()
            await page.get_by_role("link", name="Observations", exact=True).click()
            await page.get_by_role("heading", name="Recent captures").wait_for()
            await page.get_by_role("link", name="System status", exact=True).click()
            await page.get_by_role("heading", name="Environment readiness").wait_for()
            await page.get_by_text("Ready", exact=True).wait_for()
            await page.set_viewport_size({"width": 390, "height": 844})
            await page.get_by_role("link", name="Dashboard", exact=True).click()
            await image.wait_for()
            await page.screenshot(
                path=str(output / "dashboard-mobile.png"), full_page=True
            )
            overflow = await page.evaluate(
                "document.documentElement.scrollWidth > window.innerWidth"
            )
            assert not overflow, "Mobile layout overflows horizontally"
            assert not errors, errors
            (output / "dashboard-result.json").write_text(
                json.dumps(
                    {
                        "capture_displayed": True,
                        "persists_after_reload": True,
                        "history_navigation": True,
                        "system_ready": True,
                        "mobile_no_horizontal_overflow": True,
                        "page_errors": errors,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            print(
                "Dashboard acceptance passed: capture, PNG display, reload, history, status, mobile"
            )
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
