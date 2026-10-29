import asyncio
from urllib.parse import urlsplit

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Route, async_playwright

from inti.domain.entities import Observation
from inti.domain.exceptions import DependencyError, NavigationError
from inti.domain.ports import ArtifactStoragePort
from inti.infrastructure.config import ConfigurationProvider


class PlaywrightBrowserAdapter:
    def __init__(self, settings: ConfigurationProvider, storage: ArtifactStoragePort) -> None:
        self.settings, self.storage = settings, storage
        self.lock = asyncio.Semaphore(2)

    def authorized(self, url: str) -> bool:
        return url in self.settings.browser_allowed_urls

    async def available(self) -> bool:
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(
                    headless=True, timeout=self.settings.browser_timeout_ms
                )
                await browser.close()
            return True
        except (PlaywrightError, OSError):
            return False

    async def capture(self, url: str, width: int, height: int) -> Observation:
        if not self.authorized(url):
            raise NavigationError("URL is not an authorized local target")
        # Validate dimensions before allocating a browser.
        Observation(source_url=url, page_title="", width=width, height=height)
        allowed_origin = urlsplit(url)

        async def restrict(route: Route) -> None:
            target = urlsplit(route.request.url)
            same_origin = (target.scheme, target.netloc) == (
                allowed_origin.scheme,
                allowed_origin.netloc,
            )
            navigation_ok = not route.request.is_navigation_request() or self.authorized(
                route.request.url
            )
            if same_origin and navigation_ok:
                # Fetch without following redirects: a redirect must never contact
                # an external destination before a final-URL check can run.
                response = await route.fetch(
                    max_redirects=0, timeout=self.settings.browser_timeout_ms
                )
                if 300 <= response.status < 400:
                    await route.abort()
                else:
                    await route.fulfill(response=response)
            else:
                await route.abort()

        async with self.lock, async_playwright() as playwright:
            try:
                browser = await playwright.chromium.launch(
                    headless=True, timeout=self.settings.browser_timeout_ms
                )
            except PlaywrightError as exc:
                raise DependencyError("Chromium could not be launched") from exc
            try:
                context = await browser.new_context(
                    viewport={"width": width, "height": height},
                    service_workers="block",
                    accept_downloads=False,
                )
                await context.route("**/*", restrict)
                # No websocket egress from the observed application.
                await context.route_web_socket("**/*", lambda ws: ws.close())
                page = await context.new_page()
                response = await page.goto(
                    url, wait_until="networkidle", timeout=self.settings.browser_timeout_ms
                )
                if not response or not response.ok or not self.authorized(page.url):
                    raise NavigationError("Demo navigation failed or left allowlist")
                observation = Observation(
                    source_url=page.url, page_title=await page.title(), width=width, height=height
                )
                data = await page.screenshot(
                    type="png", full_page=False, timeout=self.settings.browser_timeout_ms
                )
                await self.storage.write(observation.id, data)
                return observation
            except PlaywrightError as exc:
                raise DependencyError("Browser capture failed; check demo and Chromium") from exc
            finally:
                await browser.close()
