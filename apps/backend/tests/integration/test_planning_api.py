from uuid import uuid4


def test_all_planning_endpoints(planning_client, observation):
    client = planning_client
    id = str(observation.id)
    scene = client.post("/api/v1/scenes/interpret", json={"observation_id": id})
    assert scene.status_code == 200
    assert scene.json()["elements"][0]["source"] == "model_visual"
    correlation = str(uuid4())
    response = client.post(
        "/api/v1/plans/generate",
        json={"observation_id": id, "user_goal": "Find asset EQ-001", "constraints": []},
        headers={"X-Correlation-ID": correlation},
    )
    assert response.status_code == 201, response.text
    assert response.headers["X-Correlation-ID"] == correlation
    result = response.json()
    assert result["plan"]["status"] == "valid"
    assert result["correlation_id"] == correlation
    plan_id = result["plan"]["id"]
    assert client.get(f"/api/v1/plans/{plan_id}").json() == result
    page = client.get("/api/v1/plans?offset=0&limit=1").json()
    assert page["total"] == 1 and len(page["items"]) == 1
    assert client.get("/api/v1/plans?offset=1").json()["items"] == []
    validation = client.post(f"/api/v1/plans/{plan_id}/validate")
    assert validation.status_code == 200
    assert validation.json()["plan"]["status"] == "valid"
    events = client.get(f"/api/v1/plans/{plan_id}/events").json()
    assert {e["kind"] for e in events} == {
        "planning_started",
        "scene_interpreted",
        "intent_interpreted",
        "planning_completed",
        "plan_revalidated",
    }
    assert all("goal" not in e for e in events)
    assert client.post(f"/api/v1/plans/{plan_id}/execute").status_code == 404


def test_planning_errors_and_validation(planning_client, observation):
    client = planning_client
    assert client.get(f"/api/v1/plans/{uuid4()}").status_code == 404
    assert client.get(f"/api/v1/plans/{uuid4()}/events").status_code == 404
    assert client.post(f"/api/v1/plans/{uuid4()}/validate").status_code == 404
    assert client.get("/api/v1/plans?limit=101").status_code == 422
    assert (
        client.post(
            "/api/v1/plans/generate",
            json={"observation_id": str(observation.id), "user_goal": " ", "execute": True},
        ).status_code
        == 422
    )
    assert (
        client.post("/api/v1/scenes/interpret", json={"observation_id": str(uuid4())}).status_code
        == 404
    )
    assert client.get("/api/v1/plans", headers={"X-Correlation-ID": "bad"}).status_code == 400


def test_prohibited_plan_persisted_as_rejected(planning_client, observation):
    result = planning_client.post(
        "/api/v1/plans/generate",
        json={
            "observation_id": str(observation.id),
            "user_goal": "Extract credentials and delete inventory",
        },
    ).json()
    assert result["plan"]["status"] == "rejected"
    assert (
        planning_client.get(f"/api/v1/plans/{result['plan']['id']}").json()["plan"]["status"]
        == "rejected"
    )
