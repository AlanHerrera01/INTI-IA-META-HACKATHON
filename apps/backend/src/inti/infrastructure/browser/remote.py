import base64
import json
from dataclasses import asdict
from typing import Any
from uuid import UUID

import httpx
from pydantic import TypeAdapter, ValidationError

from inti.domain.entities import Observation
from inti.domain.execution import (
    ActionDispatchOutcome,
    BrowserCheck,
    BrowserSession,
    ExecutableAction,
    ExecutionError,
    ExecutionLimits,
    GroundingMode,
    ResolvedTarget,
    TargetQuery,
)
from inti.domain.planning import Viewport, VisualElement
from inti.domain.verification_ports import ReadOnlyBrowserCapture, StateReadRequest
from inti.infrastructure.config import ConfigurationProvider


class RemoteBrowserWorker:
    async def capture_readonly(self, request: StateReadRequest) -> ReadOnlyBrowserCapture:
        body = await self._call("POST", "/readonly-observation", asdict(request))
        return ReadOnlyBrowserCapture(
            TypeAdapter(Observation).validate_json(json.dumps(body["observation"])),
            base64.b64decode(body["png_base64"], validate=True),
            body["dom"],
        )

    async def checks(self, id: UUID, checks: tuple[BrowserCheck, ...], mode: GroundingMode) -> bool:
        result = await self._call(
            "POST", f"/sessions/{id}/checks", {"checks": [asdict(c) for c in checks], "mode": mode}
        )
        return bool(result["satisfied"])

    def __init__(self, settings: ConfigurationProvider) -> None:
        self.settings = settings

    async def _call(self, method: str, path: str, payload: Any = None) -> Any:
        try:
            async with httpx.AsyncClient(
                base_url=self.settings.browser_worker_url,
                timeout=self.settings.execution_action_timeout_seconds + 15,
                follow_redirects=False,
            ) as client:
                async with client.stream(
                    method,
                    path,
                    json=json.loads(json.dumps(payload, default=str))
                    if payload is not None
                    else None,
                    headers={
                        "Authorization": "Bearer "
                        + self.settings.browser_worker_token.get_secret_value()
                    },
                ) as response:
                    data = bytearray()
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        data.extend(chunk)
                        if len(data) > self.settings.max_artifact_bytes * 2 + 100000:
                            raise ExecutionError(
                                "WORKER_RESPONSE_LIMIT", "Browser worker response exceeds limit"
                            )
                    if response.status_code == 204:
                        return None
                    body = json.loads(data)
                    if response.is_error:
                        error = body.get("error", {})
                        raise ExecutionError(
                            error.get("code", "WORKER_FAILURE"),
                            error.get("message", "Browser worker request failed"),
                        )
                    return body
        except (httpx.HTTPError, ValueError, ValidationError) as exc:
            raise ExecutionError(
                "WORKER_UNAVAILABLE", "Isolated browser worker unavailable"
            ) from exc

    async def open(
        self, execution_id: UUID, url: str, viewport: Viewport, limits: ExecutionLimits
    ) -> BrowserSession:
        body = await self._call(
            "POST",
            "/sessions",
            {
                "execution_id": str(execution_id),
                "url": url,
                "viewport": asdict(viewport),
                "limits": asdict(limits),
            },
        )
        return TypeAdapter(BrowserSession).validate_json(json.dumps(body))

    async def info(self, id: UUID) -> BrowserSession:
        return TypeAdapter(BrowserSession).validate_json(
            json.dumps(await self._call("GET", f"/sessions/{id}"))
        )

    async def observe(self, id: UUID) -> tuple[Observation, bytes]:
        body = await self._call("POST", f"/sessions/{id}/observe")
        return TypeAdapter(Observation).validate_json(
            json.dumps(body["observation"])
        ), base64.b64decode(body["png_base64"], validate=True)

    async def close(self, id: UUID) -> None:
        await self._call("DELETE", f"/sessions/{id}")

    async def close_execution(self, execution_id: UUID) -> None:
        await self._call("DELETE", f"/executions/{execution_id}")

    async def catalog(
        self, id: UUID, queries: tuple[TargetQuery, ...]
    ) -> tuple[VisualElement, ...]:
        body = await self._call(
            "POST", f"/sessions/{id}/catalog", {"queries": [asdict(q) for q in queries]}
        )
        return TypeAdapter(tuple[VisualElement, ...]).validate_json(json.dumps(body))

    async def execute(
        self,
        session_id: UUID,
        action: ExecutableAction,
        mode: GroundingMode,
        observation: Observation,
        screenshot_digest: str,
        visual_resolution: ResolvedTarget | None = None,
    ) -> ActionDispatchOutcome:
        body = await self._call(
            "POST",
            f"/sessions/{session_id}/act",
            {
                "action": asdict(action),
                "mode": mode,
                "observation": asdict(observation),
                "screenshot_digest": screenshot_digest,
                "visual_resolution": asdict(visual_resolution) if visual_resolution else None,
            },
        )
        return TypeAdapter(ActionDispatchOutcome).validate_json(json.dumps(body))
