"""Measured local verification benchmark; no model calls or fabricated verdicts."""

import argparse
import asyncio
import json
import statistics
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from verification_harness import VerificationHarness

SCENARIOS = (
    (
        "save_rejected_with_confirmation",
        {"reject_updates": True, "optimistic_on_reject": True},
        False,
    ),
    ("wrong_record_updated", {"mutation_target_override": "PC-105"}, False),
    ("optimistic_ui_without_persistence", {"optimistic_only": True}, False),
    ("read_only_source_unavailable", {}, True),
    ("correct_persisted_update", {}, False),
)


async def benchmark(output: Path, workdir: Path) -> None:
    raw = []
    for name, faults, unavailable in SCENARIOS:
        harness = VerificationHarness(workdir / name)
        await harness.start()
        try:
            measured = await harness.scenario(faults, unavailable)
            measured["scenario"] = name
            measured["fault_seed"] = 42
            raw.append(measured)
            print(
                json.dumps(
                    {
                        key: measured[key]
                        for key in (
                            "scenario",
                            "execution_status",
                            "expected_verdict",
                            "actual_verdict",
                            "latency_ms",
                        )
                    }
                ),
                flush=True,
            )
        finally:
            await harness.close()
    positive = [
        row
        for row in raw
        if row["goal_persisted_ground_truth"]
        and row["unrelated_assets_unchanged_ground_truth"]
        and row["source_available"]
    ]
    false_positive = [
        row
        for row in raw
        if row["execution_status"] == "COMPLETED"
        and row["all_immediate_postconditions_passed"]
        and not row["goal_persisted_ground_truth"]
        and row["source_available"]
    ]
    criteria = [item for row in raw for item in row["criterion_results"]]
    total = len(raw)
    summary = {
        "mode": "actual_chromium_sqlite_readonly_verification_no_model",
        "recorded_at": datetime.now(UTC).isoformat(),
        "fault_seed": 42,
        "scenarios": total,
        "verification_success_rate": {
            "numerator": sum(
                row["actual_verdict"] == "VERIFIED_SUCCESS" for row in raw
            ),
            "denominator": total,
        },
        "verdict_accuracy": {
            "numerator": sum(
                row["actual_verdict"] == row["expected_verdict"] for row in raw
            ),
            "denominator": total,
        },
        "false_positive_detection_rate": {
            "numerator": sum(
                row["actual_verdict"] == "VERIFIED_FAILURE" for row in false_positive
            ),
            "denominator": len(false_positive),
        },
        "false_negative_rate": {
            "numerator": sum(
                row["actual_verdict"] == "VERIFIED_FAILURE" for row in positive
            ),
            "denominator": len(positive),
        },
        "inconclusive_rate": {
            "numerator": sum(row["actual_verdict"] == "INCONCLUSIVE" for row in raw),
            "denominator": total,
        },
        "mean_verification_latency_ms": statistics.mean(
            row["latency_ms"] for row in raw
        ),
        "evidence_collection_failures": sum(
            row["evidence_collection_failures"] for row in raw
        ),
        "criteria_evaluation_accuracy": {
            "numerator": sum(row["observed"] == row["expected"] for row in criteria),
            "denominator": len(criteria),
        },
        "evidence_integrity_validation_failures": sum(
            row["integrity_failures"] for row in raw
        ),
        "observed_inventory_mutations_by_verifier": sum(
            row["verifier_changed_inventory"] for row in raw
        ),
        "model_calls": 0,
        "model_assisted_evaluation": False,
        "ground_truth": "Separate harness read-only SQLite connection; verifier is not given the fault configuration",
        "scope": "One trial per deterministic fault; coordinator repositories use isolated SQLite. Not a statistical reliability estimate.",
        "results": [
            {key: value for key, value in row.items() if key != "report"} for row in raw
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(summary, indent=2, default=str) + "\n", encoding="utf-8"
    )
    output.with_suffix(".raw.json").write_text(
        json.dumps(raw, indent=2, default=str) + "\n", encoding="utf-8"
    )
    if summary["verdict_accuracy"]["numerator"] != total or any(
        row["verifier_changed_inventory"] for row in raw
    ):
        raise RuntimeError(
            "Measured verification benchmark did not satisfy its expected outcomes"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("benchmarks/reports/phase-05-verification.json"),
    )
    parser.add_argument(
        "--workdir",
        type=Path,
        default=Path("artifacts/verification-benchmark") / uuid4().hex,
    )
    args = parser.parse_args()
    asyncio.run(benchmark(args.output, args.workdir))
