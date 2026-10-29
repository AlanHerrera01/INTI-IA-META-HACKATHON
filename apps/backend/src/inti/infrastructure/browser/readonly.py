from uuid import uuid4

from playwright.async_api import Error as PlaywrightError

from inti.domain.exceptions import DependencyError
from inti.domain.execution import ExecutionError, ExecutionLimits
from inti.domain.planning import Viewport
from inti.domain.verification_ports import ReadOnlyBrowserCapture, StateReadRequest
from inti.infrastructure.browser.controller import BrowserSessionManager


class ReadOnlyBrowserAdapter:
    def __init__(self, manager: BrowserSessionManager) -> None:
        self.manager = manager

    async def capture_readonly(self, request: StateReadRequest) -> ReadOnlyBrowserCapture:
        try:
            return await self._capture(request)
        except (PlaywrightError, TimeoutError) as exc:
            raise DependencyError("Fresh read-only browser evidence is unavailable") from exc

    async def _capture(self, request: StateReadRequest) -> ReadOnlyBrowserCapture:
        config = self.manager.settings
        if not config.verification_read_token.get_secret_value():
            raise ExecutionError(
                "READ_ONLY_CAPABILITY_MISSING", "Read-only browser evidence is not configured"
            )
        collection = uuid4()
        session = await self.manager.open(
            collection,
            config.verification_readonly_url,
            Viewport(1440, 900),
            ExecutionLimits(
                max_actions=1,
                max_duration_seconds=30,
                action_timeout_seconds=5,
                max_navigation_count=1,
            ),
            read_only=True,
        )
        try:
            runtime = self.manager._get(session.id)
            await runtime.page.get_by_text(
                "Persisted state loaded through the read-only interface.", exact=True
            ).wait_for(timeout=5000)
            observation, png = await self.manager.observe(session.id)
            row = runtime.page.get_by_test_id(f"record-{request.record_id}")
            count = await row.count()
            if count > 1:
                raise ExecutionError(
                    "READ_ONLY_RECORD_AMBIGUOUS",
                    "Read-only browser found duplicate record identities",
                )
            visible = count == 1 and await row.is_visible()
            status = await row.locator('[data-field="status"]').inner_text() if visible else None
            return ReadOnlyBrowserCapture(
                observation,
                png,
                {
                    "record_id": request.record_id,
                    "visible": visible,
                    "status": status,
                    "url": runtime.page.url,
                    "nonce": str(request.nonce),
                },
            )
        finally:
            await self.manager.close_execution(collection)
