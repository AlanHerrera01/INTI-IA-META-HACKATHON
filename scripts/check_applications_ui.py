"""Validate the authorized Windows application picker with one reviewed Notepad launch."""

import json
import time
from pathlib import Path

import httpx
from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    output = ROOT / "docs/screenshots/computer"
    output.mkdir(parents=True, exist_ok=True)
    headers = {"Authorization": "Bearer " + token()}
    with httpx.Client(
        base_url="http://127.0.0.1:8000", headers=headers, trust_env=False
    ) as api:
        state = api.get("/api/v1/computer/state").json()
        device = next(
            d
            for d in state["devices"]
            if not d["revoked"] and time.time() - d["last_seen"] < 30
        )
        catalog = api.get(f"/api/v1/computer/applications/{device['id']}").json()
        app = next(
            a
            for a in catalog["applications"]
            if a["path"].lower() == r"c:\windows\system32\notepad.exe"
        )
        assert not app["allowed"], (
            "The test never changes an existing operator permission"
        )
        errors = []
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": 1600, "height": 1100})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto("http://127.0.0.1:5173/computer")
            page.get_by_label("Credencial de operador").fill(token())
            page.get_by_role("button", name="Conectar", exact=True).click()
            region = page.get_by_role("region", name="Aplicaciones de este equipo")
            page.get_by_label("Buscar aplicaciones").fill(app["name"])
            row = region.locator("article").filter(
                has=page.get_by_text(app["path"], exact=True)
            )
            expect(
                row.get_by_role("button", name="Autorizar aplicación", exact=True)
            ).to_be_enabled(timeout=20000)
            expect(
                row.get_by_role("button", name="Preparar apertura", exact=True)
            ).to_be_disabled()

            def confirm(dialog):
                assert app["name"] in dialog.message and app["path"] in dialog.message
                dialog.accept()

            page.on("dialog", confirm)
            row.get_by_role("button", name="Autorizar aplicación", exact=True).click()
            expect(
                row.get_by_role("button", name="Quitar permiso", exact=True)
            ).to_be_enabled()
            row.get_by_role("button", name="Preparar apertura", exact=True).click()
            selected = page.get_by_role("region", name="Tarea del equipo seleccionada")
            expect(selected.get_by_text(app["name"], exact=True)).to_be_visible(
                timeout=15000
            )
            task = api.get("/api/v1/computer/state").json()["tasks"][0]
            assert (
                task["status"] == "DRAFT" and task["plan"]["kind"] == "open_application"
            )
            assert task["plan"]["application"]["path"] == app["path"]
            selected.get_by_role(
                "button", name="Revisar y ejecutar", exact=True
            ).click()
            dialog = page.get_by_role("dialog")
            expect(dialog).to_contain_text(app["path"])
            expect(dialog).to_contain_text(app["identity"])
            expect(dialog).to_contain_text(task["digest"])
            page.screenshot(
                path=output / "application-exact-approval.png", full_page=True
            )
            dialog.get_by_role(
                "button", name="Aprobar y ejecutar en este equipo", exact=True
            ).click()
            expect(selected.locator("header .computer-tag")).to_have_text(
                "COMPLETADA", timeout=60000
            )
            task = api.get("/api/v1/computer/state").json()["tasks"][0]
            receipt = task["result"]["steps"][0]
            assert (
                receipt["path"] == app["path"]
                and receipt["application_id"] == app["id"]
            )
            assert (
                receipt["identity"] == app["identity"]
                and receipt["status"] == "LAUNCH_REQUESTED"
            )
            row.get_by_role("button", name="Quitar permiso", exact=True).click()
            expect(
                row.get_by_role("button", name="Autorizar aplicación", exact=True)
            ).to_be_enabled()
            expect(
                row.get_by_role("button", name="Preparar apertura", exact=True)
            ).to_be_disabled()
            layouts = []
            for language in ("es", "en"):
                page.get_by_label("Idioma / Language").select_option(language)
                for width in (1366, 1600, 1920):
                    page.set_viewport_size({"width": width, "height": 1100})
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= innerWidth"
                    )
                    layouts.append(
                        {"language": language, "width": width, "overflow": False}
                    )
                page.set_viewport_size({"width": 1600, "height": 1100})
                page.evaluate("window.scrollTo(0,0)")
                page.wait_for_timeout(250)
                page.screenshot(
                    path=output / f"applications-{language}.png", full_page=True
                )
            assert not errors, errors
            browser.close()
    evidence = {
        "recorded_at_unix": time.time(),
        "catalog_count": len(catalog["applications"]),
        "task": task,
        "layouts": layouts,
        "page_errors": errors,
        "permission_removed_after_sample": True,
        "visual_window_verified": False,
        "model_calls": 0,
    }
    (ROOT / "docs/evidence/applications-ui.json").write_text(
        json.dumps(evidence, indent=2), encoding="utf-8"
    )
    print(
        "Real application detection, authorization, exact approval, launch receipt and permission removal verified."
    )


if __name__ == "__main__":
    main()
