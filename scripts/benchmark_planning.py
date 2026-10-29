"""Deterministic synthetic policy regression benchmark; never claims model accuracy.

Use --live plus INTI_LIVE_MODEL_TESTS=1 and --observation-map for explicit billable
Meta evaluation through the running API. Default mode makes no network requests.
"""

import argparse
import json
import os
import statistics
import time
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import httpx
from inti.domain.planning import (
    ActionParameters,
    ActionPlan,
    ActionTarget,
    BoundingBox,
    CoordinateSystem,
    ElementType,
    GroundingSource,
    PlannedAction,
    PlannedActionType,
    RiskLevel,
    TaskIntent,
    Viewport,
    VisualElement,
    VisualScene,
)
from inti.domain.planning_policy import PlanningPolicy

ROOT = Path(__file__).resolve().parents[1]


def fixture_case(case):
    """Explicit synthetic model-output fixtures mirroring the demo's visible controls."""
    viewport = Viewport(1440, 900)
    elements = [
        VisualElement(
            id,
            kind,
            label,
            f"TEST FIXTURE: {label}",
            BoundingBox(x, y, width, height, CoordinateSystem.PIXELS),
            True,
            True,
            GroundingSource.MODEL_VISUAL,
            0.9,
        )
        for id, kind, label, x, y, width, height in [
            ("search", ElementType.INPUT, "Search equipment", 100, 200, 350, 45),
            ("save", ElementType.BUTTON, "Save changes", 1000, 200, 160, 45),
            ("status", ElementType.DROPDOWN, "EQ-001 status", 1000, 330, 160, 45),
            ("table", ElementType.TABLE, "Equipment inventory", 100, 280, 1100, 350),
        ]
    ]
    variant = case["fixture"]
    if variant == "disabled_save":
        elements[1] = replace(elements[1], enabled=False)
    if variant == "renamed_save":
        elements[1] = replace(elements[1], label="Commit inventory")
    ambiguities = ()
    if variant == "missing_assignee":
        ambiguities = ("Assigned-user fields are not visible in the demo",)
    if variant == "ambiguous":
        ambiguities = ("Specify asset ID and desired status",)
    scene = VisualScene(
        uuid4(), viewport, tuple(elements), "SYNTHETIC POLICY FIXTURE", ()
    )
    intent = TaskIntent(
        case["goal"],
        "INTI Inventory",
        (),
        "Requested control visibly identified",
        ambiguities,
        (case["goal"],),
    )
    target = ActionTarget(
        case["target"], f"Inspect {case['target']}", GroundingSource.MODEL_VISUAL, False
    )
    if variant == "missing_control":
        target = ActionTarget(
            None, "Unobserved Export control", GroundingSource.UNRESOLVED, True
        )
    action = PlannedAction(
        "inspect",
        PlannedActionType.INSPECT,
        target,
        ActionParameters(evidence="Requested control can be visibly identified"),
        ("Inventory screenshot is available",),
        ("Requested visible control identified",),
        "Inspect the observed interface",
        RiskLevel.LOW,
    )
    actions = (action,)
    if variant == "disabled_save":
        click = replace(
            action,
            id="click",
            action_type=PlannedActionType.CLICK,
            parameters=ActionParameters(),
        )
        actions = (click, action)
    return scene, intent, actions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--observation-map", type=Path)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "benchmarks/reports/phase-02-policy.json"
    )
    args = parser.parse_args()
    if args.live and (
        os.environ.get("INTI_LIVE_MODEL_TESTS") != "1" or not args.observation_map
    ):
        parser.error("Live calls require INTI_LIVE_MODEL_TESTS=1 and --observation-map")
    cases = json.loads(
        (ROOT / "benchmarks/scenarios/planning.json").read_text(encoding="utf-8")
    )
    observation_map = json.loads(args.observation_map.read_text()) if args.live else {}
    rows = []
    for case in cases:
        start = time.perf_counter()
        row = {"id": case["id"], "schema_valid": True, "model_request_failure": False}
        if args.live:
            if case["id"] not in observation_map:
                row.update(
                    status="not_run",
                    schema_valid=None,
                    reason="Missing prepared observation",
                )
                rows.append(row)
                continue
            try:
                response = httpx.post(
                    "http://127.0.0.1:8000/api/v1/plans/generate",
                    json={
                        "observation_id": observation_map[case["id"]],
                        "user_goal": case["goal"],
                    },
                    timeout=250,
                )
                response.raise_for_status()
                body = response.json()
                from inti.domain.planning import PlanningResult
                from pydantic import TypeAdapter

                result = TypeAdapter(PlanningResult).validate_json(json.dumps(body))
                plan, scene = result.plan, result.scene
            except (httpx.HTTPError, ValueError) as exc:
                row.update(
                    status="failed"
                    if isinstance(exc, httpx.HTTPError)
                    else "invalid_schema",
                    model_request_failure=isinstance(exc, httpx.HTTPError),
                    schema_valid=False,
                )
                row["latency_ms"] = (time.perf_counter() - start) * 1000
                rows.append(row)
                continue
        else:
            scene, intent, actions = fixture_case(case)
            if case["fixture"] == "unsupported_action":
                try:
                    replace(actions[0], action_type="execute_shell")
                except ValueError:
                    row.update(
                        status="rejected",
                        schema_valid=False,
                        unsupported_action=True,
                        expected_outcome_matched=True,
                        clarification_correct=True,
                        grounding_valid=True,
                        latency_ms=(time.perf_counter() - start) * 1000,
                    )
                    rows.append(row)
                    continue
            plan = PlanningPolicy(("http://127.0.0.1:8001/",)).validate(
                ActionPlan(uuid4(), scene.observation_id, case["goal"], actions),
                scene,
                intent,
            )
        for element in scene.elements:
            if element.bounding_box:
                element.bounding_box.validate_viewport(scene.viewport)
        needs_clarification = any(
            f.severity == "clarification" for f in plan.validation_results
        )
        row.update(
            status=plan.status,
            expected_outcome_matched=plan.status == case["expected_status"],
            clarification_correct=needs_clarification == case["expected_clarification"],
            grounding_valid=True,
            unsupported_action=False,
            latency_ms=(time.perf_counter() - start) * 1000,
        )
        rows.append(row)
    evaluated = [row for row in rows if row["schema_valid"] is not None]
    n = len(evaluated)
    report = {
        "mode": "live_model" if args.live else "synthetic_policy_fixtures",
        "not_execution_success": True,
        "evaluated": n,
        "schema_validity_rate": sum(r["schema_valid"] for r in evaluated) / n
        if n
        else None,
        "plan_validation_success_rate": sum(r["status"] == "valid" for r in evaluated)
        / n
        if n
        else None,
        "expected_outcome_match_rate": sum(
            r.get("expected_outcome_matched", False) for r in evaluated
        )
        / n
        if n
        else None,
        "grounding_bounds_validity_rate": sum(
            r.get("grounding_valid", False) for r in evaluated
        )
        / n
        if n
        else None,
        "unsupported_action_rate": sum(
            r.get("unsupported_action", False) for r in evaluated
        )
        / n
        if n and not args.live
        else None,
        "clarification_accuracy": sum(
            r.get("clarification_correct", False) for r in evaluated
        )
        / n
        if n
        else None,
        "mean_latency_ms": statistics.mean(r["latency_ms"] for r in evaluated)
        if n
        else None,
        "model_request_failures": sum(r["model_request_failure"] for r in rows),
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if not args.live and any(not row.get("expected_outcome_matched") for row in rows):
        raise SystemExit(
            "Synthetic policy regression detected; inspect the saved report"
        )
    print(
        json.dumps(
            {key: value for key, value in report.items() if key != "rows"}, indent=2
        )
    )


if __name__ == "__main__":
    main()
