"""Capture genuine screenshots from the running INTI stack.

Requires the Docker stack from scripts/start_demo.ps1 and a local operator
capability in .env. The capability is typed into the page and never logged.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from uuid import UUID

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "screenshots"
BASE = os.environ.get("INTI_WEB_URL", "http://127.0.0.1:5173")


def token() -> str:
    value = os.environ.get("EXECUTION_OPERATOR_TOKEN", "")
    if not value:
        match = re.search(
            r"^EXECUTION_OPERATOR_TOKEN=(.*)$",
            (ROOT / ".env").read_text(encoding="utf-8"),
            re.MULTILINE,
        )
        value = match.group(1).strip() if match else ""
    if len(value) < 24:
        raise SystemExit("Configure EXECUTION_OPERATOR_TOKEN in .env first")
    return value


def settle(page: Page) -> None:
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)


def shot(page: Page, name: str) -> None:
    page.screenshot(path=OUTPUT / name, full_page=True)
    print(f"wrote docs/screenshots/{name}")


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{BASE}/?guided=1")
        settle(page)
        page.get_by_label("Operator capability").fill(token())
        page.get_by_role("button", name="Connect").click()
        settle(page)
        shot(page, "phase7-mission-control.png")

        page.get_by_role("link", name="Benchmark Lab", exact=True).click()
        settle(page)
        shot(page, "phase7-benchmark-lab.png")

        page.get_by_role("link", name="Mission Control", exact=True).click()
        settle(page)
        evidence_path = ROOT / "docs/evidence/phase7-live-demo.json"
        mission_id = str(
            UUID(json.loads(evidence_path.read_text(encoding="utf-8"))["mission"]["id"])
        )
        mission_link = page.locator(f'.mission-list a[href="/missions/{mission_id}"]')
        if mission_link.count():
            mission_link.first.click()
            settle(page)
            shot(page, "phase7-active-mission.png")
            evidence = page.get_by_role("link", name="Inspect outcome evidence")
            if evidence.count():
                evidence.first.click()
                settle(page)
                page.get_by_alt_text(
                    "Fresh independent read-only inventory observation"
                ).wait_for()
                shot(page, "phase7-verification.png")

        page.get_by_role("link", name="Recovery Center", exact=True).click()
        settle(page)
        shot(page, "phase7-recovery-center.png")
        page.get_by_role("link", name="Mission Control", exact=True).click()
        settle(page)
        responsive = []
        for width, height, label in [(1024, 900, "tablet"), (390, 844, "mobile")]:
            page.set_viewport_size({"width": width, "height": height})
            settle(page)
            overflow = page.evaluate(
                "document.documentElement.scrollWidth > innerWidth + 1"
            )
            assert not overflow, f"Horizontal overflow at {width}px"
            shot(page, f"phase7-mission-{label}.png")
            responsive.append(
                {"width": width, "height": height, "horizontal_overflow": overflow}
            )
        assert not errors, errors
        (ROOT / "docs/evidence/phase7-ui.json").write_text(
            json.dumps(
                {
                    "source": "Actual local running application; project Playwright",
                    "model_calls": 0,
                    "page_errors": errors,
                    "responsive_checks": responsive,
                    "mission_id": mission_id,
                    "in_app_browser": "Unavailable: missing sandbox policy metadata",
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
