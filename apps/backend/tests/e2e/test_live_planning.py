"""Explicit opt-in, billable Meta integration. No generated actions are executed."""

import os

import httpx
import pytest

pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(
        os.environ.get("INTI_LIVE_MODEL_TESTS") != "1",
        reason="Live Meta planning requires explicit INTI_LIVE_MODEL_TESTS=1",
    ),
]


async def test_real_meta_planning_only():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", timeout=250) as client:
        model = (await client.get("/api/v1/models/status")).json()
        if not model["configured"]:
            pytest.skip("External blocker: no Meta credentials configured")
        observation = await client.post("/api/v1/observations/capture", json={})
        observation.raise_for_status()
        response = await client.post(
            "/api/v1/plans/generate",
            json={
                "observation_id": observation.json()["id"],
                "user_goal": (
                    "Locate the Save changes button. "
                    "Prepare an inspection-only plan; do not click it."
                ),
            },
        )
        response.raise_for_status()
        result = response.json()
        assert result["scene"]["elements"]
        assert result["plan"]["actions"]
        assert result["plan"]["status"] in {"valid", "requires_clarification"}
        assert all(usage["response_id"] for usage in result["model_usage"])
        assert (await client.get(f"/api/v1/plans/{result['plan']['id']}")).status_code == 200
