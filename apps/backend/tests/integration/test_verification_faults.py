import sys
from pathlib import Path

import pytest

SCRIPTS = str(Path(__file__).resolve().parents[4] / "scripts")
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
from verification_harness import VerificationHarness  # noqa: E402


@pytest.mark.parametrize(
    "faults,source_down,expected",
    [
        ({"reject_updates": True, "optimistic_on_reject": True}, False, "VERIFIED_FAILURE"),
        ({"mutation_target_override": "PC-105"}, False, "VERIFIED_FAILURE"),
        ({"optimistic_only": True}, False, "VERIFIED_FAILURE"),
        ({}, True, "INCONCLUSIVE"),
        ({}, False, "VERIFIED_SUCCESS"),
    ],
)
async def test_real_false_positive_scenarios(tmp_path, faults, source_down, expected):
    harness = VerificationHarness(tmp_path)
    await harness.start()
    try:
        measured = await harness.scenario(faults, source_down)
        assert measured["execution_status"] == "COMPLETED", measured
        assert measured["all_immediate_postconditions_passed"]
        assert measured["actual_verdict"] == expected, measured
        assert measured["expected_verdict"] == expected
        assert not measured["verifier_changed_inventory"]
        assert all(row["observed"] == row["expected"] for row in measured["criterion_results"])
        assert measured["integrity_failures"] == 0
        if source_down:
            assert measured["evidence_collection_failures"] > 0
    finally:
        await harness.close()
