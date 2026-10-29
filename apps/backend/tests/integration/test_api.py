from unittest.mock import AsyncMock
from uuid import uuid4

from inti.domain.entities import VisionAnalysis


def test_health_and_status(client) -> None:
    assert client.get("/api/v1/health").json() == {"status": "ok", "version": "0.2.0"}
    assert client.get("/api/v1/system/status").json()["ready"] is True
    model = client.get("/api/v1/models/status").json()
    assert model["configured"] is False
    assert model["available"] is None
    assert "api_key" not in model
    assert "database_url" not in model


def test_capture_retrieve_and_analysis_configuration_error(client, observation) -> None:
    response = client.post("/api/v1/observations/capture", json={})
    assert response.status_code == 201
    result = response.json()
    assert result["id"] == str(observation.id)
    assert "artifact_path" not in result
    assert client.get(f"/api/v1/observations/{observation.id}").json() == result
    assert client.get("/api/v1/observations").json() == [result]
    failure = client.post(f"/api/v1/observations/{observation.id}/analyze", json={})
    assert failure.status_code == 503
    assert failure.json()["error"]["code"] == "ConfigurationError"


def test_missing_and_validation(client) -> None:
    assert client.get(f"/api/v1/observations/{uuid4()}").status_code == 404
    assert client.post("/api/v1/observations/capture", json={"width": 20000}).status_code == 422
    assert client.get("/api/v1/observations/not-a-uuid").status_code == 422
    assert client.get("/api/v1/observations?limit=101").status_code == 422
    assert client.post("/api/v1/observations/capture", json={"script": "bad"}).status_code == 422


def test_cors_restricted(client) -> None:
    response = client.get("/api/v1/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_openapi(client) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/observations/{id}/analyze" in schema["paths"]


def test_analysis_endpoint_persists_normalized_result(client, services, observation) -> None:
    model = AsyncMock()
    model.analyze_observation.return_value = VisionAnalysis("test-only", "Synthetic test result")
    services.model = model
    client.post("/api/v1/observations/capture", json={})
    response = client.post(f"/api/v1/observations/{observation.id}/analyze", json={})
    assert response.status_code == 200
    assert response.json()["summary"] == "Synthetic test result"
    assert (
        client.get(f"/api/v1/observations/{observation.id}").json()["analysis_status"]
        == "completed"
    )
