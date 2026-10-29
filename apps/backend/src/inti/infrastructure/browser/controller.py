"""Persistent isolated contexts, exact target resolution and typed dispatch only."""

import asyncio
import hashlib
import os
import time
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from urllib.parse import urljoin, urlsplit
from uuid import UUID, uuid4

from playwright.async_api import (
    Browser,
    BrowserContext,
    Locator,
    Page,
    Playwright,
    Route,
    async_playwright,
)
from playwright.async_api import (
    Error as PlaywrightError,
)

from inti.domain.entities import Observation
from inti.domain.execution import (
    ActionDispatchOutcome,
    AuthorizationStatus,
    BrowserCheck,
    BrowserSession,
    BrowserTarget,
    CheckKind,
    ExecutableAction,
    ExecutionError,
    ExecutionLimits,
    GroundingMode,
    ResolvedTarget,
    TargetQuery,
)
from inti.domain.planning import (
    BoundingBox,
    CoordinateSystem,
    ElementType,
    GroundingSource,
    PlannedActionType,
    RiskLevel,
    Viewport,
    VisualElement,
)
from inti.domain.planning_policy import PROHIBITED
from inti.infrastructure.config import ConfigurationProvider


@dataclass
class LiveContext:
    browser: Browser
    context: BrowserContext
    page: Page
    session: BrowserSession
    limits: ExecutionLimits
    lock: asyncio.Lock
    last_observation: Observation | None = None
    last_digest: str = ""
    read_only: bool = False
    target_frames: dict[str, list[tuple[float, ...]]] = field(default_factory=dict)


class BrowserSessionManager:
    async def checks(self, id: UUID, checks: tuple[BrowserCheck, ...], mode: GroundingMode) -> bool:
        runtime = self._get(id)
        async with runtime.lock, asyncio.timeout(runtime.limits.action_timeout_seconds):
            self._state(runtime)
            inspector = PlaywrightActionExecutor(self)
            return all([await inspector._check(runtime, check, mode) for check in checks])

    def __init__(self, settings: ConfigurationProvider) -> None:
        self.settings = settings
        self.sessions: dict[UUID, LiveContext] = {}
        self.guard = asyncio.Lock()
        self.playwright: Playwright | None = None
        self.janitor: asyncio.Task[None] | None = None
        self.revoked: dict[UUID, datetime] = {}

    async def startup(self) -> None:
        self.playwright = await async_playwright().start()
        self.janitor = asyncio.create_task(self._cleanup())

    async def shutdown(self) -> None:
        if self.janitor:
            self.janitor.cancel()
            await asyncio.gather(self.janitor, return_exceptions=True)
        for id in tuple(self.sessions):
            await self.close(id)
        if self.playwright:
            await self.playwright.stop()

    async def _cleanup(self) -> None:
        while True:
            await asyncio.sleep(1)
            now = datetime.now(UTC)
            self.revoked = {
                id: created
                for id, created in self.revoked.items()
                if (now - created).total_seconds() < 600
            }
            for id, runtime in tuple(self.sessions.items()):
                if (
                    now - runtime.session.last_activity_at
                ).total_seconds() > self.settings.browser_session_ttl_seconds:
                    await self.close(id)

    def _get(self, id: UUID) -> LiveContext:
        runtime = self.sessions.get(id)
        if runtime is None or runtime.page.is_closed():
            raise ExecutionError("SESSION_LOST", "Browser session is no longer available")
        return runtime

    def _state(self, runtime: LiveContext) -> None:
        allowed = (
            [self.settings.verification_readonly_url]
            if runtime.read_only
            else self.settings.browser_allowed_urls
        )
        if runtime.page.url not in allowed:
            raise ExecutionError("URL_DENIED", "Browser left the exact authorized URL allowlist")
        if runtime.page.viewport_size != {
            "width": runtime.session.viewport.width,
            "height": runtime.session.viewport.height,
        }:
            raise ExecutionError("VIEWPORT_CHANGED", "Browser viewport changed")

    async def open(
        self,
        execution_id: UUID,
        url: str,
        viewport: Viewport,
        limits: ExecutionLimits,
        read_only: bool = False,
    ) -> BrowserSession:
        allowed_urls = (
            [self.settings.verification_readonly_url]
            if read_only
            else self.settings.browser_allowed_urls
        )
        if url not in allowed_urls:
            raise ExecutionError("URL_DENIED", "Only configured local demo URLs are allowed")
        async with self.guard:
            if execution_id in self.revoked:
                raise ExecutionError("SESSION_REVOKED", "Execution browser capability was revoked")
            if len(self.sessions) >= self.settings.execution_max_concurrent_sessions:
                raise ExecutionError("SESSION_LIMIT", "Maximum concurrent browser sessions reached")
            if self.playwright is None:
                raise ExecutionError("WORKER_UNAVAILABLE", "Browser worker has not started")
            browser = await self.playwright.chromium.launch(
                headless=True,
                timeout=self.settings.browser_timeout_ms,
                env={
                    key: value
                    for key, value in os.environ.items()
                    if key.upper() in {"PATH", "SYSTEMROOT", "TEMP", "TMP", "HOME", "USERPROFILE"}
                },
            )
            try:
                context = await browser.new_context(
                    viewport={"width": viewport.width, "height": viewport.height},
                    service_workers="block",
                    accept_downloads=False,
                    permissions=[],
                    extra_http_headers={
                        "Authorization": "Bearer "
                        + self.settings.verification_read_token.get_secret_value()
                    }
                    if read_only
                    else {},
                )
                page = await context.new_page()
                context.on("page", lambda popup: asyncio.create_task(popup.close()))
                now = datetime.now(UTC)
                session = BrowserSession(
                    uuid4(), execution_id, url, url, viewport, now, now, "OPEN"
                )
                runtime = LiveContext(
                    browser, context, page, session, limits, asyncio.Lock(), read_only=read_only
                )
                origin = urlsplit(url)

                async def restrict(route: Route) -> None:
                    destination = urlsplit(route.request.url)
                    if (destination.scheme, destination.netloc) != (
                        origin.scheme,
                        origin.netloc,
                    ) or route.request.method not in (
                        {"GET", "HEAD"} if read_only else {"GET", "HEAD", "POST", "PUT"}
                    ):
                        await route.abort()
                        return
                    if route.request.is_navigation_request():
                        if (
                            route.request.frame != page.main_frame
                            or route.request.url not in allowed_urls
                        ):
                            await route.abort()
                            return
                        if runtime.session.navigation_count >= limits.max_navigation_count:
                            await route.abort()
                            return
                        runtime.session = replace(
                            runtime.session, navigation_count=runtime.session.navigation_count + 1
                        )
                    try:
                        response = await route.fetch(
                            max_redirects=0, timeout=self.settings.browser_timeout_ms
                        )
                        if (
                            300 <= response.status < 400
                            or "attachment"
                            in response.headers.get("content-disposition", "").lower()
                        ):
                            await route.abort()
                        else:
                            await route.fulfill(response=response)
                    except PlaywrightError:
                        await route.abort()

                await context.route("**/*", restrict)
                await context.route_web_socket("**/*", lambda ws: ws.close())
                response = await page.goto(
                    url, wait_until="networkidle", timeout=self.settings.browser_timeout_ms
                )
                if not response or not response.ok:
                    raise ExecutionError("NAVIGATION_FAILED", "Authorized demo could not be loaded")
                self._state(runtime)
                if execution_id in self.revoked:
                    raise ExecutionError("SESSION_REVOKED", "Execution was cancelled while opening")
                self.sessions[session.id] = runtime
                return runtime.session
            except BaseException:
                await browser.close()
                raise

    async def close(self, id: UUID) -> None:
        runtime = self.sessions.pop(id, None)
        if runtime:
            await runtime.browser.close()

    async def close_execution(self, execution_id: UUID) -> None:
        self.revoked[execution_id] = datetime.now(UTC)
        for id, runtime in tuple(self.sessions.items()):
            if runtime.session.execution_id == execution_id:
                await self.close(id)

    async def info(self, id: UUID) -> BrowserSession:
        runtime = self._get(id)
        self._state(runtime)
        return replace(runtime.session, current_url=runtime.page.url)

    async def catalog(
        self, id: UUID, queries: tuple[TargetQuery, ...]
    ) -> tuple[VisualElement, ...]:
        if len(queries) > 20:
            raise ExecutionError("CATALOG_LIMIT", "Too many declared read-only targets")
        observation, _ = await self.observe(id)
        runtime = self._get(id)
        elements = []
        for query in queries:
            resolved = await TargetResolver().resolve(
                runtime.page,
                query.target,
                GroundingMode.HYBRID_DOM,
                observation,
                runtime.last_digest,
            )
            special = {
                "textbox": ElementType.INPUT,
                "combobox": ElementType.DROPDOWN,
                "dialog": ElementType.MODAL,
            }
            element_type = (
                special[query.target.role]
                if query.target.role in special
                else ElementType(query.target.role)
            )
            elements.append(
                VisualElement(
                    query.id,
                    element_type,
                    query.target.name,
                    "Read-only accessible DOM match in the authorized sandbox",
                    resolved.bounding_box,
                    True,
                    True,
                    GroundingSource.DOM_ASSISTED,
                )
            )
        return tuple(elements)

    async def observe(self, id: UUID) -> tuple[Observation, bytes]:
        runtime = self._get(id)
        async with runtime.lock:
            self._state(runtime)
            observation = Observation(
                runtime.page.url,
                await runtime.page.title(),
                runtime.session.viewport.width,
                runtime.session.viewport.height,
                restricted=True,
            )
            data = await runtime.page.screenshot(
                type="png", full_page=False, timeout=self.settings.browser_timeout_ms
            )
            if len(data) > self.settings.max_artifact_bytes:
                raise ExecutionError("SCREENSHOT_LIMIT", "Screenshot exceeds configured size limit")
            runtime.last_observation = observation
            runtime.last_digest = hashlib.sha256(data).hexdigest()
            frames = await runtime.page.locator(
                'button,input,select,[role="button"],[role="textbox"],[role="combobox"]'
            ).evaluate_all("""nodes => nodes.slice(0,200).map(node=>{
                const r=node.getBoundingClientRect();
                const style=getComputedStyle(node);
                const role=node.getAttribute('role') || (node.tagName==='SELECT'?'combobox':
                    node.tagName==='INPUT'?(node.type==='checkbox'?'checkbox':'textbox'):'button');
                const name=(node.getAttribute('aria-label') ||
                    (node.labels?[...node.labels].map(label=>label.innerText).join(' '):'') ||
                    node.innerText || '').trim().replace(/\\s+/g,' ');
                return {role,name,box:[r.x,r.y,r.width,r.height],
                    visible:r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none'};
            })""")
            runtime.target_frames = {}
            for frame in frames:
                if frame["visible"]:
                    key = frame["role"] + "\0" + frame["name"]
                    runtime.target_frames.setdefault(key, []).append(tuple(frame["box"]))
            runtime.session = replace(
                runtime.session, current_url=runtime.page.url, last_activity_at=datetime.now(UTC)
            )
            return observation, data


class TargetResolver:
    def locator(self, page: Page, target: BrowserTarget, mode: GroundingMode) -> Locator:
        if mode == GroundingMode.SELECTOR_BASED:
            if target.selector is None:
                raise ExecutionError("TARGET_UNRESOLVED", "Approved selector is missing")
            semantic = (
                page.get_by_text(target.name, exact=True)
                if target.role == "text"
                else page.get_by_role(target.role, name=target.name, exact=True)  # type: ignore[arg-type]
            )
            return page.locator(target.selector).and_(semantic)
        if mode != GroundingMode.HYBRID_DOM:
            raise ExecutionError("TARGET_UNRESOLVED", "Fresh visual grounding required")
        if target.role == "text":
            return page.get_by_text(target.name, exact=True)
        # Role is restricted by the domain contract, not supplied executable code.
        return page.get_by_role(target.role, name=target.name, exact=True)  # type: ignore[arg-type]

    async def resolve(
        self,
        page: Page,
        target: BrowserTarget,
        mode: GroundingMode,
        observation: Observation,
        digest: str,
        enabled: bool = True,
    ) -> ResolvedTarget:
        locator = self.locator(page, target, mode)
        count = await locator.count()
        if count > 1:
            raise ExecutionError("TARGET_AMBIGUOUS", "Multiple elements match the approved target")
        if count != 1 or not await locator.is_visible():
            raise ExecutionError("TARGET_UNRESOLVED", "Approved target is not uniquely visible")
        if enabled and not await locator.is_enabled():
            raise ExecutionError("TARGET_DISABLED", "Approved target is disabled")
        box = await locator.bounding_box()
        if box is None:
            raise ExecutionError("TARGET_UNRESOLVED", "Target has no visible bounds")
        bounds = BoundingBox(
            box["x"], box["y"], box["width"], box["height"], CoordinateSystem.PIXELS
        )
        try:
            bounds.validate_viewport(Viewport(observation.width, observation.height))
        except ValueError as exc:
            raise ExecutionError(
                "TARGET_UNRESOLVED", "Target is outside the observed viewport"
            ) from exc
        if target.role == "link":
            href = await locator.get_attribute("href")
            if href and urljoin(page.url, href) != page.url:
                raise ExecutionError(
                    "URL_DENIED", "Link navigation requires a separate authorized navigate action"
                )
        return ResolvedTarget(
            "approved_test_id"
            if mode == GroundingMode.SELECTOR_BASED
            else "accessible_role_or_label",
            mode,
            target,
            bounds,
            observation.id,
            digest,
        )


class PlaywrightActionExecutor:
    def __init__(self, manager: BrowserSessionManager) -> None:
        self.manager, self.resolver = manager, TargetResolver()

    async def _check(self, runtime: LiveContext, check: BrowserCheck, mode: GroundingMode) -> bool:
        if check.kind == CheckKind.URL:
            return runtime.page.url == check.expected
        if mode == GroundingMode.VISUAL_ONLY:
            raise ExecutionError(
                "VISUAL_ASSERTION_UNSUPPORTED", "DOM assertions cannot be called visual-only"
            )
        assert check.target is not None
        locator = self.resolver.locator(runtime.page, check.target, mode)
        if check.kind == CheckKind.NOT_VISIBLE:
            count = await locator.count()
            return count == 0 or (count == 1 and not await locator.is_visible())
        if await locator.count() != 1 or not await locator.is_visible():
            return False
        if check.kind == CheckKind.VISIBLE:
            return True
        if check.kind == CheckKind.ENABLED:
            return await locator.is_enabled()
        if check.kind == CheckKind.INPUT_VALUE:
            return await locator.input_value() == check.expected
        if check.kind == CheckKind.SELECTED_OPTION:
            return await locator.locator("option:checked").inner_text() == check.expected
        if check.kind == CheckKind.TEXT:
            return (await locator.inner_text()).strip() == check.expected
        return False

    async def execute(
        self,
        session_id: UUID,
        action: ExecutableAction,
        mode: GroundingMode,
        observation: Observation,
        screenshot_digest: str,
        visual_resolution: ResolvedTarget | None = None,
    ) -> ActionDispatchOutcome:
        runtime = self.manager._get(session_id)
        resolution: ResolvedTarget | None = None
        executed, attempted = False, False
        try:
            async with runtime.lock, asyncio.timeout(runtime.limits.action_timeout_seconds):
                self.manager._state(runtime)
                if runtime.read_only and action.action_type not in {
                    PlannedActionType.INSPECT,
                    PlannedActionType.VERIFY,
                }:
                    raise ExecutionError(
                        "READ_ONLY_SESSION",
                        "Verification browser contexts cannot modify application state",
                    )
                if (
                    action.authorization_status != AuthorizationStatus.APPROVED
                    or action.risk_level == RiskLevel.PROHIBITED
                ):
                    raise ExecutionError(
                        "APPROVAL_REQUIRED", "Worker requires scoped action approval"
                    )
                if (
                    runtime.last_observation is None
                    or observation.id != runtime.last_observation.id
                    or screenshot_digest != runtime.last_digest
                    or (datetime.now(UTC) - observation.timestamp).total_seconds()
                    > self.manager.settings.execution_observation_max_age_seconds
                ):
                    raise ExecutionError(
                        "OBSERVATION_STALE", "A fresh session-bound observation is required"
                    )
                if PROHIBITED.search(
                    " ".join(
                        str(v)
                        for v in (
                            action.parameters.text,
                            action.parameters.url,
                            action.parameters.option,
                        )
                    )
                ):
                    raise ExecutionError("PROHIBITED", "Unsafe action payload")
                if action.target:
                    if mode == GroundingMode.VISUAL_ONLY:
                        if (
                            visual_resolution is None
                            or visual_resolution.observation_id != observation.id
                            or visual_resolution.target != action.target
                            or visual_resolution.bounding_box is None
                            or visual_resolution.screenshot_digest != screenshot_digest
                        ):
                            raise ExecutionError(
                                "TARGET_UNRESOLVED", "Fresh model grounding is required"
                            )
                        current = await runtime.page.screenshot(type="png", full_page=False)
                        if hashlib.sha256(current).hexdigest() != screenshot_digest:
                            raise ExecutionError(
                                "TARGET_UNRESOLVED", "Screen changed since visual grounding"
                            )
                        resolution = visual_resolution
                    else:
                        resolution = await self.resolver.resolve(
                            runtime.page, action.target, mode, observation, screenshot_digest
                        )
                        previous = runtime.target_frames.get(
                            action.target.role + "\0" + action.target.name, []
                        )
                        if len(previous) == 1 and resolution.bounding_box:
                            box = resolution.bounding_box
                            current_box = (box.x, box.y, box.width, box.height)
                            if len(previous[0]) == 4 and any(
                                abs(old - new) > 2
                                for old, new in zip(previous[0], current_box, strict=True)
                            ):
                                raise ExecutionError(
                                    "ELEMENT_MOVED",
                                    "Control moved after observation; no action attempted",
                                )
                else:
                    resolution = ResolvedTarget(
                        "page", mode, None, None, observation.id, screenshot_digest
                    )
                for check in action.preconditions:
                    if not await self._check(runtime, check, mode):
                        raise ExecutionError(
                            "PRECONDITION_FAILED", "A typed precondition was not satisfied"
                        )
                self.manager._state(runtime)
                kind = action.action_type
                locator = (
                    self.resolver.locator(runtime.page, action.target, mode)
                    if action.target and mode != GroundingMode.VISUAL_ONLY
                    else None
                )
                if locator and action.action_type in {
                    PlannedActionType.CLICK,
                    PlannedActionType.TYPE_TEXT,
                    PlannedActionType.SELECT_OPTION,
                }:
                    hit = await locator.evaluate("""node => {
                        const r=node.getBoundingClientRect();
                        const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                        return {clear:!!top && (top===node || node.contains(top)),
                            modal:!!top?.closest('dialog,[role="dialog"]')};
                    }""")
                    if not hit["clear"]:
                        raise ExecutionError(
                            "MODAL_OBSTRUCTION" if hit["modal"] else "TARGET_OBSTRUCTED",
                            "Approved control is covered; no action attempted",
                        )
                attempted = True
                if kind == PlannedActionType.CLICK:
                    if locator:
                        await locator.click(timeout=runtime.limits.action_timeout_seconds * 1000)
                    else:
                        assert resolution.bounding_box
                        box = resolution.bounding_box.pixels(runtime.session.viewport)
                        await runtime.page.mouse.click(
                            box.x + box.width / 2, box.y + box.height / 2
                        )
                elif kind == PlannedActionType.TYPE_TEXT:
                    if locator:
                        await locator.fill(action.parameters.text or "")
                    else:
                        assert resolution.bounding_box
                        box = resolution.bounding_box.pixels(runtime.session.viewport)
                        await runtime.page.mouse.click(
                            box.x + box.width / 2, box.y + box.height / 2
                        )
                        await runtime.page.keyboard.press("ControlOrMeta+A")
                        await runtime.page.keyboard.insert_text(action.parameters.text or "")
                elif kind == PlannedActionType.SELECT_OPTION:
                    if locator is None:
                        raise ExecutionError(
                            "VISUAL_ACTION_UNSUPPORTED",
                            "Visual-only selection requires further visual reasoning",
                        )
                    options = await locator.locator("option").all_text_contents()
                    if options.count(action.parameters.option or "") != 1:
                        raise ExecutionError(
                            "TARGET_UNRESOLVED", "Requested option is not uniquely present"
                        )
                    await locator.select_option(label=action.parameters.option)
                elif kind == PlannedActionType.NAVIGATE:
                    if action.parameters.url not in self.manager.settings.browser_allowed_urls:
                        raise ExecutionError("URL_DENIED", "Navigation outside exact allowlist")
                    if runtime.session.navigation_count >= runtime.limits.max_navigation_count:
                        raise ExecutionError("NAVIGATION_LIMIT", "Navigation budget exhausted")
                    response = await runtime.page.goto(
                        action.parameters.url, wait_until="networkidle"
                    )
                    if not response or not response.ok:
                        raise ExecutionError("NAVIGATION_FAILED", "Authorized navigation failed")
                elif kind == PlannedActionType.SCROLL:
                    amount = action.parameters.amount or 0
                    direction = action.parameters.direction
                    await runtime.page.mouse.wheel(
                        amount if direction == "right" else -amount if direction == "left" else 0,
                        amount if direction == "down" else -amount if direction == "up" else 0,
                    )
                elif kind == PlannedActionType.WAIT:
                    await asyncio.sleep(action.parameters.seconds or 0)
                elif kind not in {PlannedActionType.INSPECT, PlannedActionType.VERIFY}:
                    raise ExecutionError("UNSUPPORTED_ACTION", "Action is not supported")
                executed = True
                # Wait for application work, not a retry of the action itself.
                await runtime.page.wait_for_load_state(
                    "networkidle", timeout=runtime.limits.action_timeout_seconds * 1000
                )
                self.manager._state(runtime)
                deadline = time.monotonic() + min(2, runtime.limits.action_timeout_seconds / 2)
                while True:
                    passed = [
                        await self._check(runtime, check, mode)
                        for check in action.expected_postconditions
                    ]
                    if all(passed):
                        break
                    if time.monotonic() >= deadline:
                        raise ExecutionError(
                            "POSTCONDITION_FAILED", "A typed immediate postcondition failed"
                        )
                    # Observe pending application effects; never dispatch the action again.
                    await asyncio.sleep(0.05)
                runtime.session = replace(
                    runtime.session,
                    last_activity_at=datetime.now(UTC),
                    current_url=runtime.page.url,
                )
                return ActionDispatchOutcome(resolution, True, True)
        except ExecutionError as exc:
            return ActionDispatchOutcome(
                resolution,
                executed,
                False if executed else None,
                exc.code,
                str(exc),
                attempted and not executed,
            )
        except (TimeoutError, PlaywrightError):
            return ActionDispatchOutcome(
                resolution,
                executed,
                None,
                "ACTION_TIMEOUT_OR_BROWSER_ERROR",
                "Browser action did not finish safely; no retry was attempted",
                attempted and not executed,
            )
