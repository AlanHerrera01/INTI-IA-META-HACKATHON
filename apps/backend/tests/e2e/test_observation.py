import os
import struct
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from inti.domain.exceptions import DependencyError, NavigationError
from inti.infrastructure.browser import PlaywrightBrowserAdapter
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.storage import LocalArtifactStorage

pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(
        os.environ.get("INTI_E2E") != "1", reason="Set INTI_E2E=1 and start demo/backend/PostgreSQL"
    ),
]


async def test_real_demo_browser(tmp_path) -> None:
    settings = ConfigurationProvider(_env_file=None, artifact_dir=tmp_path)
    storage = LocalArtifactStorage(tmp_path)
    browser = PlaywrightBrowserAdapter(settings, storage)
    assert await browser.available()
    observation = await browser.capture(settings.demo_url, 1440, 900)
    image = await storage.read(observation.id)
    assert struct.unpack(">II", image[16:24]) == (1440, 900)
    assert "Inventory" in observation.page_title
    assert observation.source_url == settings.demo_url
    with pytest.raises(NavigationError):
        await browser.capture("https://example.com/", 1440, 900)


async def test_live_api_persistence() -> None:
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", timeout=60) as client:
        status = (await client.get("/api/v1/system/status")).json()
        assert status["ready"] is True
        capture = await client.post("/api/v1/observations/capture", json={})
        assert capture.status_code == 201
        observation = capture.json()
        read = await client.get(f"/api/v1/observations/{observation['id']}")
        assert read.json() == observation
        screenshot = await client.get(observation["screenshot_url"])
        assert screenshot.content.startswith(b"\x89PNG\r\n\x1a\n")
        blocked = await client.post(
            "/api/v1/observations/capture", json={"url": "http://example.com/"}
        )
        assert blocked.status_code == 422


async def test_redirect_does_not_reach_unapproved_path(tmp_path) -> None:
    visited = []

    class RedirectHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            visited.append(self.path)
            if self.path == "/":
                self.send_response(302)
                self.send_header("Location", "/private")
            else:
                self.send_response(200)
            self.end_headers()

        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), RedirectHandler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    url = f"http://127.0.0.1:{server.server_port}/"
    settings = ConfigurationProvider(_env_file=None, browser_allowed_urls=[url])
    browser = PlaywrightBrowserAdapter(settings, LocalArtifactStorage(tmp_path))
    try:
        with pytest.raises(DependencyError):
            await browser.capture(url, 1440, 900)
        assert visited == ["/"]
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=2)
