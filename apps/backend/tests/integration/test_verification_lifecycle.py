"""Real repositories; deliberately stalled/failed collector fixtures for lifecycle checks."""

import asyncio
import sys
from pathlib import Path

from inti.domain.verification import VerificationBundle, VerificationSession

SCRIPTS = str(Path(__file__).resolve().parents[4] / "scripts")
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
from verification_harness import VerificationHarness  # noqa: E402


async def test_timeout_processing_failure_cancel_and_restart_do_not_write(tmp_path):
    h = VerificationHarness(tmp_path)
    await h.start()
    try:
        measured = await h.scenario({})
        from uuid import UUID

        execution_id = UUID(measured["execution_id"])
        before = h.truth()
        entered = asyncio.Event()

        class StalledCollectorFixture:
            async def collect(self, *args):
                entered.set()
                await asyncio.Event().wait()

        h.verifier.collector = StalledCollectorFixture()
        h.verifier.timeout_seconds = 0.1
        b = await h.verifier.create(execution_id, key="timeout-test")
        b = await h.settle_verification(b.session.id)
        assert b.session.status == "INCONCLUSIVE"
        assert b.session.error_code == "VERIFICATION_TIMEOUT"
        assert b.session.final_verdict == "INCONCLUSIVE"
        entered.clear()
        h.verifier.timeout_seconds = 10
        b = await h.verifier.create(execution_id, key="cancel-test")
        await asyncio.wait_for(entered.wait(), 2)
        b = await h.verifier.cancel(b.session.id)
        assert b.session.status == "CANCELLED" and b.session.final_verdict == "INCONCLUSIVE"
        assert b.session.id not in h.verifier.tasks

        class FailedCollectorFixture:
            async def collect(self, *args):
                raise RuntimeError("Explicit internal processing failure fixture")

        h.verifier.collector = FailedCollectorFixture()
        b = await h.verifier.create(execution_id, key="processing-test")
        b = await h.settle_verification(b.session.id)
        assert b.session.status == "FAILED" and b.session.final_verdict == "INCONCLUSIVE"
        criteria = b.criteria_version
        orphan = VerificationBundle(
            VerificationSession(criteria.task_id, execution_id, criteria.id, "restart-test"),
            criteria,
        )
        await h.repository.commit(orphan, None, ())
        await h.verifier.recover_interrupted()
        b = await h.verifier.get(orphan.session.id)
        assert b.session.status == "FAILED" and b.session.error_code == "PROCESS_RESTART"
        assert b.session.final_verdict == "INCONCLUSIVE"
        assert h.truth() == before
    finally:
        await h.close()
