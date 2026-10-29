"""Actual application SQLite, read-only HTTP identity and fresh Chromium evidence."""

import asyncio
import runpy
import threading
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr
from test_execution import approve, make_service, settle
from test_execution import demo_server as demo_server

from inti.application.sandbox_recipe import SandboxRecipe
from inti.application.verification import IndependentVerificationOrchestrator
from inti.domain.verification import (
    V_TERMINAL,
    CriterionStatus,
    EvidenceType,
    VerificationStatus,
    VerificationVerdict,
)
from inti.infrastructure.browser.readonly import ReadOnlyBrowserAdapter
from inti.infrastructure.persistence import Base
from inti.infrastructure.persistence.verification import SQLAlchemyVerificationRepository
from inti.infrastructure.verification_evidence import (
    EvidenceIntegrityAdapter,
    InventoryEvidenceCollector,
    LocalEvidenceStorage,
    ReadOnlyInventoryAdapter,
)

TOKEN = "test-read-only-inventory-capability"


@pytest.fixture
def readonly_server(tmp_path, demo_server):
    module = runpy.run_path("apps/demo-app/verification_server.py")
    server = module["create_verification_server"]("127.0.0.1", 0, tmp_path / "demo.db", TOKEN)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def verifier_stack(tmp_path, demo_server, readonly_server):
    config, observations, manager, execution = make_service(tmp_path, demo_server)
    config.verification_readonly_url = readonly_server
    config.verification_read_token = SecretStr(TOKEN)
    Base.metadata.create_all(observations.engine)
    repository = SQLAlchemyVerificationRepository(observations.engine)
    storage = LocalEvidenceStorage(tmp_path / "verification-artifacts")
    state = ReadOnlyInventoryAdapter(config)
    collector = InventoryEvidenceCollector(state, ReadOnlyBrowserAdapter(manager), config)
    verifier = IndependentVerificationOrchestrator(
        repository,
        execution.repository,
        collector,
        state,
        storage,
        EvidenceIntegrityAdapter(config),
        repository,
        readonly_server,
    )
    return config, observations, manager, execution, verifier


async def wait_verification(verifier, id):
    async with asyncio.timeout(40):
        while True:
            bundle = await verifier.get(id)
            if bundle.session.status in V_TERMINAL and id not in verifier.tasks:
                return bundle
            await asyncio.sleep(0.03)


async def test_real_independent_verification(tmp_path, demo_server, readonly_server):
    _, observations, manager, execution, verifier = verifier_stack(
        tmp_path, demo_server, readonly_server
    )
    await manager.startup()
    try:
        approved = await approve(execution, await SandboxRecipe(execution, demo_server).prepare())
        await verifier.prepare(approved.session.id)
        criteria = await verifier.repository.latest_criteria(approved.session.id)
        assert criteria.baseline is not None
        await execution.start(approved.session.id)
        completed = await settle(execution, approved.session.id)
        async with httpx.AsyncClient() as client:
            before = (await client.get(demo_server + "api/inventory")).json()
        pending = await verifier.create(completed.session.id)
        assert (await verifier.create(completed.session.id)).session.id == pending.session.id
        verified = await wait_verification(verifier, pending.session.id)
        assert verified.session.status == VerificationStatus.COMPLETED, verified.session
        assert verified.session.final_verdict == VerificationVerdict.VERIFIED_SUCCESS, (
            verified.session
        )
        assert all(r.status == CriterionStatus.PASS for r in verified.session.criteria_results)
        assert len(verified.evidence) == 8
        assert len({e.artifact_reference for e in verified.evidence}) < len(verified.evidence)
        report = await verifier.report(verified.session.id)
        assert report["effective_verdict"] == VerificationVerdict.VERIFIED_SUCCESS
        assert all(item["intact"] for item in report["integrity_checks"])
        assert not completed.session.overall_goal_verified
        for evidence in verified.evidence:
            _, content = await verifier.artifact(verified.session.id, evidence.id)
            assert content
        evidence = next(
            e
            for e in verified.evidence
            if e.evidence_type == EvidenceType.DATABASE_STATE and e.metadata.role == "final"
        )
        _, data = await verifier.artifact(verified.session.id, evidence.id)
        integrity = verifier.integrity
        assert integrity.validate(evidence, data, verified, completed).valid
        replay_id = uuid4()
        # Replay, target swap, stale/future capture and source forgery cannot pass.
        for altered in [
            replace(
                evidence,
                verification_session_id=replay_id,
                metadata=replace(evidence.metadata, verification_id=replay_id),
            ),
            replace(evidence, metadata=replace(evidence.metadata, target_record_id="PC-105")),
            replace(evidence, captured_at=datetime.now(UTC) - timedelta(days=1)),
            replace(evidence, captured_at=datetime.now(UTC) + timedelta(seconds=10)),
            replace(evidence, metadata=replace(evidence.metadata, source_url="http://untrusted/")),
            replace(evidence, metadata=replace(evidence.metadata, nonce=uuid4())),
        ]:
            assert not integrity.validate(altered, data, verified, completed).valid
        assert not integrity.validate(evidence, data + b"x", verified, completed).valid
        events = await verifier.repository.events(verified.session.id)
        assert {
            "verification_created",
            "evidence_collection_started",
            "evidence_collected",
            "criterion_evaluated",
            "verification_completed",
        } <= {event.event_type for event in events}
        assert await verifier.repository.events(verified.session.id, events[-1].sequence) == []
        projected = await execution.repository.events(completed.session.id)
        assert "verification_completed" in {event.event_type for event in projected}
        async with httpx.AsyncClient() as client:
            assert (await client.get(demo_server + "api/inventory")).json() == before
            assert (
                await client.post(
                    readonly_server + "api/inventory",
                    json=before[0],
                    headers={"Authorization": "Bearer " + TOKEN},
                )
            ).status_code == 405
            assert (
                await client.get(readonly_server + "verification/v1/snapshot")
            ).status_code == 401
            for verb in ("PUT", "PATCH", "DELETE"):
                assert (
                    await client.request(
                        verb,
                        readonly_server + "api/inventory",
                        json={"id": "PC-104", "status": "Inactive"},
                        headers={"Authorization": "Bearer " + TOKEN},
                    )
                ).status_code == 405
            assert (
                await client.get(
                    readonly_server + "api/inventory?sql=DELETE",
                    headers={"Authorization": "Bearer " + TOKEN},
                )
            ).status_code == 400
            assert (await client.get(demo_server + "api/inventory")).json() == before
        # Artifact corruption must not retain an effective success verdict.
        item = verified.evidence[-1]
        artifact = verifier.storage._path(item.artifact_reference)
        artifact.write_bytes(b"changed evidence")
        report = await verifier.report(verified.session.id)
        assert report["final_verdict"] == VerificationVerdict.VERIFIED_SUCCESS
        assert report["effective_verdict"] == VerificationVerdict.INCONCLUSIVE
    finally:
        await verifier.shutdown()
        await execution.shutdown()
        await manager.shutdown()
        observations.engine.dispose()
