from typing import Any
from uuid import UUID

import httpx

from inti.domain.exceptions import DependencyError
from inti.infrastructure.config import ConfigurationProvider


class LocalDemoControl:
    def __init__(self, settings: ConfigurationProvider) -> None:
        self.url = settings.demo_control_url
        self.token = settings.demo_control_token

    async def _request(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(
                timeout=5, trust_env=False, follow_redirects=False
            ) as client:
                response = await client.request(
                    method,
                    self.url + path,
                    json=payload,
                    headers={"Authorization": "Bearer " + self.token.get_secret_value()},
                )
                response.raise_for_status()
                if len(response.content) > 10000:
                    raise ValueError()
                data = response.json()
                if not isinstance(data, dict):
                    raise ValueError()
                return data
        except (httpx.HTTPError, ValueError):
            raise DependencyError(
                "The restricted synthetic demo controller is unavailable"
            ) from None

    async def status(self) -> dict[str, Any]:
        data = await self._request("GET", "state")
        if data.get("synthetic") is not True:
            raise DependencyError("Demo controls require a marked synthetic store")
        return data

    async def reset(self, store_id: UUID) -> dict[str, Any]:
        data = await self._request(
            "POST", "reset", {"store_id": str(store_id), "confirmation": "RESET PC-104"}
        )
        if data.get("synthetic") is not True or data.get("asset", {}).get("status") != "Inactive":
            raise DependencyError("Demo reset did not establish the initial state")
        return data

    async def inject(self) -> None:
        await self._request(
            "POST", "faults", {"seed": 42, "save_label": "Update Record", "move_save": True}
        )
