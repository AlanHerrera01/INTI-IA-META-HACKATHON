"""HTTP fixtures verify the smoke script never silently substitutes a no-fault run."""

import json
import runpy
import sys

import httpx
import pytest


@pytest.mark.parametrize(
    "capabilities",
    [
        {"model_calls_enabled": False, "model_configured": False, "recovery_enabled": True},
        {"model_calls_enabled": True, "model_configured": False, "recovery_enabled": True},
        {"model_calls_enabled": True, "model_configured": True, "recovery_enabled": False},
    ],
)
def test_requested_live_fault_is_blocked_before_any_mutation(tmp_path, monkeypatch, capabilities):
    module = runpy.run_path("scripts/live_demo_check.py")
    original_client = httpx.Client
    calls = []

    def respond(request):
        calls.append((request.method, request.url.path))
        assert request.method == "GET", "A blocked live demo must not reset or execute the app"
        return httpx.Response(
            200, json={"version": "0.7.0"} if request.url.path.endswith("health") else capabilities
        )

    monkeypatch.setattr(
        httpx, "Client", lambda **kw: original_client(**kw, transport=httpx.MockTransport(respond))
    )
    monkeypatch.setenv("EXECUTION_OPERATOR_TOKEN", "explicit-test-only-operator-token")
    output = tmp_path / "blocked.json"
    monkeypatch.setattr(sys, "argv", ["live_demo_check.py", "--arm-fault", "--output", str(output)])
    assert module["main"]() == 2
    report = json.loads(output.read_text())
    assert report["status"] == "BLOCKED" and not report["ok"]
    assert not report["live_model_recovery_claimed"]
    assert calls == [("GET", "/api/v1/health"), ("GET", "/api/v1/capabilities")]
