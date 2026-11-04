import json

import httpx
import pytest
from pydantic import SecretStr

from inti.infrastructure.meta import StructuredVision
from inti.infrastructure.model_evaluation import evaluate_model
from inti.infrastructure.model_metrics import ModelMetricsStore


def test_metrics_exclude_fixtures_and_other_models_and_survive_restart(tmp_path):
    store = ModelMetricsStore(tmp_path)
    store.record("m", 2, True, 10, "live", True)
    store.record("m", 4, True, None, "live", False)
    store.record("m", 1, False, None, "live", http_status=401)
    store.record("m", 1, True, 99999, "fixture", True)
    store.record("other", 1, True, 99999, "live", True)
    metrics = ModelMetricsStore(tmp_path).summary("m")
    assert metrics["attempts"] == 3
    assert metrics["mean_latency_ms"] == 3000
    assert metrics["output_tokens_per_second"] == 5
    assert metrics["grounding_hit_rate"] == 0.5
    assert metrics["grounding_samples"] == 2
    assert metrics["last_ok"] is False
    assert metrics["last_http_status"] == 401
    assert metrics["gpu_memory_bytes"] is None


async def test_calibration_is_one_fixture_call_with_no_desktop_data(services):
    calls = []
    services.settings.meta_api_key = SecretStr("fixture-key-only")

    def response(request):
        payload = json.loads(request.content)
        calls.append(payload)
        return httpx.Response(
            200,
            json={
                "id": "fixture",
                "model": services.settings.meta_model_id,
                "choices": [{"finish_reason": "stop", "message": {"content": '{"x":256,"y":160}'}}],
                "usage": {"completion_tokens": 12},
            },
        )

    services.model.transport = httpx.MockTransport(response)
    result = await evaluate_model(services.model)
    assert len(calls) == 1
    assert calls[0]["messages"][1]["content"][1]["image_url"]["url"].startswith(
        "data:image/png;base64,"
    )
    assert result["measurements"]["attempts"] == 0
    with services.model.metrics.connect() as db:
        row = db.execute("SELECT source,duration,grounding_hit FROM calls").fetchone()
    assert row[0] == "fixture" and row[1] > 0 and row[2] in (0, 1)


async def test_invalid_responses_record_failure_without_tokens(services):
    services.settings.meta_api_key = SecretStr("fixture-key-only")
    services.model.transport = httpx.MockTransport(lambda request: httpx.Response(401))
    with pytest.raises(Exception, match="Meta request failed"):
        await services.model.complete_schema(StructuredVision, "fixture", "fixture", max_retries=0)
    with services.model.metrics.connect() as db:
        row = db.execute("SELECT ok,tokens,http_status FROM calls").fetchone()
    assert row == (0, None, 401)


def test_calibration_requires_operator_and_explicit_consent(client, services):
    services.settings.execution_operator_token = SecretStr("fixture-operator-capability-only")
    response = client.post("/api/v1/models/evaluate", json={"confirm_real_call": True})
    assert response.status_code in (401, 403)
    headers = {"Authorization": "Bearer fixture-operator-capability-only"}
    assert (
        client.post(
            "/api/v1/models/evaluate", headers=headers, json={"confirm_real_call": False}
        ).status_code
        == 422
    )
    assert client.post("/api/v1/models/evaluate", headers=headers, json={}).status_code == 422
    assert client.get("/api/v1/models/status").json()["measurements"]["attempts"] == 0
    services.settings.meta_api_key = SecretStr("fixture-key-only")
    attempts = []

    def response(request):
        attempts.append(request)
        return httpx.Response(
            200,
            json={
                "id": "fixture",
                "model": services.settings.meta_model_id,
                "choices": [{"finish_reason": "stop", "message": {"content": '{"x":256,"y":160}'}}],
            },
        )

    services.model.transport = httpx.MockTransport(response)
    assert (
        client.post(
            "/api/v1/models/evaluate", headers=headers, json={"confirm_real_call": True}
        ).status_code
        == 200
    )
    assert len(attempts) == 1
