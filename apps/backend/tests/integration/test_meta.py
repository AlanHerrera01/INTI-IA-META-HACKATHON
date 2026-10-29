import json
from unittest.mock import AsyncMock

import httpx
import pytest

from inti.domain.exceptions import ConfigurationError, DependencyError
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.meta import MetaModelAPIAdapter, StructuredVision


async def test_two_image_recovery_transport_has_no_hidden_retry():
    calls = []

    def handler(request):
        calls.append(request)
        payload = json.loads(request.content)
        images = payload["messages"][1]["content"][1:]
        assert [i["image_url"]["url"] for i in images] == [
            "data:image/png;base64,cHJldmlvdXM=",
            "data:image/png;base64,Y3VycmVudA==",
        ]
        return httpx.Response(503)

    model = adapter(handler)
    with pytest.raises(DependencyError):
        await model.complete_schema(
            StructuredVision,
            "Test fixture instructions",
            "Compare",
            images_base64=("cHJldmlvdXM=", "Y3VycmVudA=="),
            max_retries=0,
        )
    assert len(calls) == 1
    with pytest.raises(DependencyError, match="Too many images"):
        await model.complete_schema(
            StructuredVision, "Test", "Test", images_base64=("fixture",) * 51, max_retries=0
        )
    assert len(calls) == 1


def adapter(handler, key="test-only-key"):
    settings = ConfigurationProvider(_env_file=None, meta_api_key=key)
    storage = AsyncMock()
    storage.read.return_value = b"test-only-image"
    return MetaModelAPIAdapter(settings, storage, httpx.MockTransport(handler))


def completion():
    # Explicitly synthetic HTTP fixture. Never used by the application runtime.
    return {
        "id": "test-response",
        "model": "muse-spark-1.3",
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": json.dumps(
                        {
                            "summary": "Synthetic test inventory",
                            "elements": ["Save button"],
                            "ui_state": "Test state",
                        }
                    )
                },
            },
        ],
    }


async def test_request_contract(observation) -> None:
    def handler(request):
        assert str(request.url) == "https://api.meta.ai/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer test-only-key"
        payload = json.loads(request.content)
        assert payload["messages"][1]["content"][1]["image_url"]["url"].startswith(
            "data:image/png;base64,"
        )
        assert payload["response_format"]["json_schema"]["strict"] is True
        return httpx.Response(200, json=completion())

    model = adapter(handler)
    assert (await model.status())["available"] is None
    result = await model.analyze_observation(observation, "Describe")
    assert result.elements == ("Save button",)
    assert (await model.status())["available"] is True


@pytest.mark.parametrize("status", [400, 401, 403])
async def test_no_retry_client_errors(observation, status) -> None:
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={"secret": "not exposed"})

    model = adapter(handler)
    with pytest.raises(DependencyError, match="Meta request failed"):
        await model.analyze_observation(observation, "Describe")
    assert len(calls) == 1
    assert (await model.status())["available"] is False


async def test_retry_transient(observation, monkeypatch) -> None:
    sleep = AsyncMock()
    monkeypatch.setattr("inti.infrastructure.meta.asyncio.sleep", sleep)
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503) if len(calls) < 3 else httpx.Response(200, json=completion())

    await adapter(handler).analyze_observation(observation, "Describe")
    assert len(calls) == 3
    assert sleep.await_count == 2


async def test_missing_credentials(observation) -> None:
    with pytest.raises(ConfigurationError):
        await adapter(lambda r: None, key="").analyze_observation(observation, "Describe")


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"choices": []},
        {
            "id": "x",
            "model": "x",
            "choices": [
                {"finish_reason": "length", "message": {"content": "invalid"}},
            ],
        },
    ],
)
async def test_invalid_response(observation, body) -> None:
    with pytest.raises(DependencyError):
        await adapter(lambda r: httpx.Response(200, json=body)).analyze_observation(
            observation, "Describe"
        )


async def test_transport_retries_are_bounded(observation, monkeypatch) -> None:
    monkeypatch.setattr("inti.infrastructure.meta.asyncio.sleep", AsyncMock())
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ConnectError("test-only failure")

    with pytest.raises(DependencyError):
        await adapter(handler).analyze_observation(observation, "Describe")
    assert len(calls) == 3


async def test_long_retry_after_does_not_retry_early(observation) -> None:
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(429, headers={"Retry-After": "120"})

    with pytest.raises(DependencyError):
        await adapter(handler).analyze_observation(observation, "Describe")
    assert len(calls) == 1
