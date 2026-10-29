import gzip
import json
from dataclasses import replace
from unittest.mock import AsyncMock

import httpx
import pytest

from inti.domain.exceptions import ConfigurationError, DependencyError
from inti.domain.planning import GroundingSource, PlannedActionType, Viewport
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.grounding import VisualGroundingAdapter
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.infrastructure.meta.planning import (
    MetaPlanningAdapter,
    MetaVisualReasoningAdapter,
    ScenePayload,
)


def scene_payload():
    return {
        "summary": "TEST FIXTURE inventory",
        "uncertainties": [],
        "elements": [
            {
                "id": "search",
                "element_type": "input",
                "label": "Search equipment",
                "description": "Synthetic search field",
                "visible": True,
                "enabled": True,
                "confidence_optional": 0.9,
                "bounding_box": {
                    "x": 100,
                    "y": 150,
                    "width": 300,
                    "height": 45,
                    "coordinate_system": "pixels",
                },
            }
        ],
    }


def intent_payload():
    return {
        "goal": "Find EQ-001",
        "target_application": "INTI Inventory",
        "constraints": [],
        "expected_outcome": "EQ-001 identified",
        "ambiguities": [],
        "explicit_requirements": ["Find EQ-001"],
        "assumptions": [],
        "unverified_inferences": [],
    }


def plan_payload():
    return {
        "actions": [
            {
                "id": "inspect",
                "action_type": "inspect",
                "target": {
                    "element_id": "search",
                    "description": "Inspect search",
                    "source": "model_visual",
                    "requires_observation": False,
                },
                "parameters": {
                    "text": None,
                    "option": None,
                    "url": None,
                    "direction": None,
                    "amount": None,
                    "seconds": None,
                    "evidence": "The search control is visibly present",
                },
                "preconditions": ["Inventory visible"],
                "expected_postconditions": ["Search identified"],
                "explanation": "Inspect the observed control",
                "risk_level": "LOW",
            }
        ]
    }


def envelope(payload):
    return {
        "id": "explicit-test-response",
        "model": "muse-spark-1.3",
        "choices": [
            {
                "finish_reason": "stop",
                "message": {"content": json.dumps(payload)},
            }
        ],
        "usage": {
            "prompt_tokens": 100,
            "completion_tokens": 40,
            "prompt_tokens_details": {"cached_tokens": 10},
        },
    }


def client_for(handler, **settings):
    config = ConfigurationProvider(_env_file=None, meta_api_key="test-only-key", **settings)
    storage = AsyncMock()
    storage.read.return_value = b"explicit-test-only-image"
    return MetaModelAPIAdapter(config, storage, httpx.MockTransport(handler)), config, storage


async def test_real_adapter_chain_with_explicit_http_fixtures(observation):
    responses = [scene_payload(), intent_payload(), plan_payload()]
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json=envelope(responses.pop(0)))

    client, settings, storage = client_for(handler)
    scene = await MetaVisualReasoningAdapter(client, storage, settings).interpret(
        observation, "Find EQ-001"
    )
    assert scene.elements[0].source == GroundingSource.MODEL_VISUAL
    assert scene.model_usage.input_tokens == 100
    planner = MetaPlanningAdapter(client, settings)
    intent = await planner.interpret_intent("Original user goal", ("No saving",), scene)
    assert intent.goal == "Original user goal" and "No saving" in intent.constraints
    actions, usage = await planner.generate(intent, scene)
    assert actions[0].action_type == PlannedActionType.INSPECT
    assert usage.output_tokens == 40
    assert requests[0]["messages"][1]["content"][1]["type"] == "image_url"
    assert len(requests[1]["messages"][1]["content"]) == 1
    assert all(r["max_completion_tokens"] == settings.planning_max_tokens for r in requests)
    assert all(r["response_format"]["json_schema"]["strict"] for r in requests)


@pytest.mark.parametrize(
    "problem", ["bounds", "duplicate", "unknown_action", "invalid_json", "oversize", "timeout"]
)
async def test_invalid_provider_outputs(observation, planning_scene, planning_intent, problem):
    payload = scene_payload()
    if problem == "bounds":
        payload["elements"][0]["bounding_box"]["x"] = 1900
    if problem == "duplicate":
        payload["elements"].append(payload["elements"][0])
    if problem == "unknown_action":
        payload = plan_payload()
        payload["actions"][0]["action_type"] = "execute_javascript"

    def handler(request):
        if problem == "timeout":
            raise httpx.ReadTimeout("explicit-test-timeout")
        if problem == "invalid_json":
            return httpx.Response(200, content=b"not JSON")
        if problem == "oversize":
            return httpx.Response(200, content=b"x" * 300000)
        return httpx.Response(200, json=envelope(payload))

    client, settings, storage = client_for(handler, planning_max_retries=0)
    with pytest.raises(DependencyError):
        if problem == "unknown_action":
            await MetaPlanningAdapter(client, settings).generate(planning_intent, planning_scene)
        else:
            await MetaVisualReasoningAdapter(client, storage, settings).interpret(observation, None)


async def test_missing_credentials_no_http(observation):
    settings = ConfigurationProvider(_env_file=None, meta_api_key="")
    storage = AsyncMock()
    storage.read.return_value = b"explicit-test-only"
    client = MetaModelAPIAdapter(settings, storage)
    with pytest.raises(ConfigurationError):
        await MetaVisualReasoningAdapter(client, storage, settings).interpret(observation, None)


def test_visual_grounding_provenance_and_viewport(planning_scene, observation):
    grounding = VisualGroundingAdapter()
    assert grounding.validate(planning_scene, observation) == planning_scene
    with pytest.raises(DependencyError):
        grounding.validate(replace(planning_scene, viewport=Viewport(1920, 1080)), observation)
    hybrid = replace(
        planning_scene,
        elements=(replace(planning_scene.elements[0], source=GroundingSource.DOM_ASSISTED),),
    )
    with pytest.raises(DependencyError):
        grounding.validate(hybrid, observation)


async def test_rate_limit_retry_and_usage(observation, monkeypatch):
    sleep = AsyncMock()
    monkeypatch.setattr("inti.infrastructure.meta.asyncio.sleep", sleep)
    calls = []

    def handler(request):
        calls.append(request)
        return (
            httpx.Response(429, headers={"Retry-After": "1"})
            if len(calls) == 1
            else httpx.Response(200, json=envelope(scene_payload()))
        )

    client, settings, storage = client_for(handler)
    scene = await MetaVisualReasoningAdapter(client, storage, settings).interpret(observation, None)
    assert scene.model_usage.retries == 1
    assert sleep.await_args.args[0] >= 1
    assert len(calls) == 2


def test_schema_is_strict_and_all_fields_required():
    schema = ScenePayload.model_json_schema()
    for object_schema in [schema, *schema.get("$defs", {}).values()]:
        if object_schema.get("type") == "object":
            assert object_schema["additionalProperties"] is False
            assert set(object_schema["required"]) == set(object_schema["properties"])


async def test_gzip_response_is_decoded_once(observation):
    body = gzip.compress(json.dumps(envelope(scene_payload())).encode())
    client, settings, storage = client_for(
        lambda request: httpx.Response(
            200,
            content=body,
            headers={"Content-Encoding": "gzip", "Content-Type": "application/json"},
        )
    )
    scene = await MetaVisualReasoningAdapter(client, storage, settings).interpret(observation, None)
    assert scene.elements[0].id == "search"
