"""Read-only checks for the deployed bilingual Windows dashboard."""

import json
import os
from pathlib import Path

from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    output = ROOT / "docs/screenshots/computer"
    errors: list[str] = []
    layouts = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1100})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(
            os.environ.get("INTI_WEB_URL", "http://127.0.0.1:5173").rstrip("/")
            + "/computer"
        )
        selector = page.get_by_label("Idioma / Language")
        expect(selector).to_have_value("es")
        expect(page.locator("html")).to_have_attribute("lang", "es")
        page.get_by_label("Credencial de operador").fill(token())
        page.get_by_role("button", name="Conectar", exact=True).click()
        expect(
            page.get_by_role("button", name="Preparar plan", exact=True)
        ).to_be_enabled()
        page.get_by_label("Contenido del archivo").fill("Mi tarea / My task")
        for language, content_label, ready, nav in [
            ("es", "Contenido del archivo", "Preparar plan", "Equipos y permisos"),
            ("en", "File contents", "Prepare plan", "Computers & Permissions"),
        ]:
            selector.select_option(language)
            expect(page.get_by_label(content_label)).to_have_value("Mi tarea / My task")
            expect(page.get_by_role("button", name=ready, exact=True)).to_be_enabled()
            expect(page.get_by_role("link", name=nav, exact=True)).to_be_visible()
            for width in (1366, 1600, 1920):
                page.set_viewport_size({"width": width, "height": 1100})
                page.wait_for_timeout(200)
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= innerWidth"
                )
                topbar = page.locator(".topbar")
                assert topbar.evaluate("el => el.scrollWidth <= el.clientWidth"), (
                    f"Header overflow: {language}, {width}"
                )
                layouts.append(
                    {"language": language, "width": width, "overflow": False}
                )
            page.set_viewport_size({"width": 1600, "height": 1100})
            page.screenshot(path=output / f"computer-{language}.png", full_page=True)
            page.get_by_role("link", name=nav, exact=True).click()
            page.wait_for_timeout(400)
            expect(
                page.get_by_role(
                    "heading",
                    name=(
                        "Equipo conectado y permisos"
                        if language == "es"
                        else "Connected Computer & Permissions"
                    ),
                )
            ).to_be_visible()
            page.get_by_role(
                "link",
                name=("Control del equipo" if language == "es" else "Computer Control"),
                exact=True,
            ).click()
            if language == "es":
                page.get_by_label(content_label).fill("Mi tarea / My task")
        page.reload()
        expect(page.get_by_label("Idioma / Language")).to_have_value("en")
        expect(page.locator("html")).to_have_attribute("lang", "en")
        selector.select_option("es")
        page.reload()
        expect(page.get_by_label("Idioma / Language")).to_have_value("es")
        assert not errors, errors
        browser.close()
    (ROOT / "docs/evidence/bilingual-ui.json").write_text(
        json.dumps(
            {
                "layouts": layouts,
                "page_errors": errors,
                "reload_persistence": True,
                "task_input_preserved_during_switch": True,
                "task_actions_executed": False,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        "Spanish/English switching, persistence, input preservation and desktop layouts verified."
    )


if __name__ == "__main__":
    main()
