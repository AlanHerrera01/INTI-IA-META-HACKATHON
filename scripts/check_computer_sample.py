"""Run the explicitly authorized Windows sample through the real dashboard.

Launches Notepad and a browser through a previously paired agent. Never prints
credentials. Saves shareable UI screenshots, video and action receipts only.
"""

import hashlib
import json
import time
from pathlib import Path

import httpx
from capture_demo_screenshots import token
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/screenshots/computer"


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(
            viewport={"width": 1600, "height": 1100},
            record_video_dir=str(ROOT / "artifacts/computer-video"),
            record_video_size={"width": 1600, "height": 1100},
        )
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5173/computer")
        page.get_by_label("Operator capability").fill(token())
        page.get_by_role("button", name="Connect", exact=True).click()
        prepare = page.get_by_role("button", name="Prepare plan", exact=True)
        expect(prepare).to_be_enabled(timeout=30000)
        page.get_by_label("New text filename").fill("INTI-Windows-sample.txt")
        content = (
            "INTI AI - real Windows sample\n\n"
            "Created by the paired local agent after exact approval in the web dashboard.\n"
            "Actions: save this new note, request Notepad, and request the approved browser page.\n"
            "No model calls were used. File readback is verified separately from app launch requests.\n"
        )
        page.get_by_label("File contents").fill(content)
        page.get_by_label("Browser page URL").fill("https://example.com/")
        prepare.click()
        review = page.get_by_role("button", name="Review & execute", exact=True)
        expect(review).to_be_enabled(timeout=15000)
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(250)
        page.screenshot(path=OUTPUT / "01-prepared.png", full_page=True)
        review.click()
        expect(page.get_by_role("dialog")).to_be_visible()
        page.screenshot(path=OUTPUT / "02-exact-approval.png", full_page=True)
        page.get_by_role("button", name="Approve & run on this computer", exact=True).click()
        selected = page.get_by_role("region", name="Selected computer task")
        expect(selected.locator("header .computer-tag")).to_have_text("COMPLETED", timeout=60000)
        selected.scroll_into_view_if_needed()
        page.wait_for_timeout(1200)
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(250)
        page.screenshot(path=OUTPUT / "03-real-action-receipts.png", full_page=True)
        with httpx.Client(trust_env=False) as client:
            response = client.get(
                "http://127.0.0.1:8000/api/v1/computer/state",
                headers={"Authorization": "Bearer " + token()},
            )
            response.raise_for_status()
            state = response.json()
        task = state["tasks"][0]
        assert task["status"] == "COMPLETED"
        assert task["plan"]["content"] == content
        receipt = task["result"]["steps"][0]
        file = Path(receipt["path"]).resolve()
        workspace = (ROOT / "artifacts/computer-workspace").resolve()
        assert file.is_relative_to(workspace)
        assert file.read_bytes() == content.encode()
        assert hashlib.sha256(file.read_bytes()).hexdigest() == receipt["sha256"]
        layouts = []
        for width in (1366, 1600, 1920):
            page.set_viewport_size({"width": width, "height": 1100})
            page.wait_for_timeout(300)
            overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth")
            assert not overflow, f"Horizontal overflow at {width}"
            layouts.append({"width": width, "horizontal_overflow": overflow})
        assert not errors, errors
        video = page.video
        context.close()
        if video:
            video.save_as(str(OUTPUT / "real-windows-sample.webm"))
        browser.close()
    evidence = {
        "recorded_at_unix": time.time(),
        "source": "real_paired_windows_agent",
        "planning_mode": "authored_local_sample",
        "model_calls": 0,
        "file_independently_read_back_by_check_script": True,
        "application_window_or_page_visually_verified": False,
        "layouts": layouts,
        "page_errors": errors,
        "task": task,
    }
    (ROOT / "docs/evidence/local-computer-sample.json").write_text(
        json.dumps(evidence, indent=2), encoding="utf-8"
    )
    print("Real Windows sample completed. File readback matched; application launch receipts recorded.")


if __name__ == "__main__":
    main()
