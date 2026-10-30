"""Local fault-injection harness. Uses production ports and real browser/database IO."""

import asyncio
import runpy
import sqlite3
import sys
import threading
import time
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

import httpx
from inti.application.execution import ExecutionOrchestrator
from inti.application.sandbox_recipe import SandboxRecipe
from inti.application.verification import IndependentVerificationOrchestrator
from inti.domain.execution import TERMINAL, ExecutionLimits
from inti.domain.execution_policy import ExecutionPolicy
from inti.domain.planning import RiskLevel
from inti.domain.planning_policy import PlanningPolicy
from inti.domain.verification import V_TERMINAL, canonical_bytes
from inti.infrastructure.browser.controller import (
    BrowserSessionManager,
    PlaywrightActionExecutor,
)
from inti.infrastructure.browser.readonly import ReadOnlyBrowserAdapter
from inti.infrastructure.config import ConfigurationProvider
from inti.infrastructure.meta import MetaModelAPIAdapter
from inti.infrastructure.meta.planning import MetaVisualReasoningAdapter
from inti.infrastructure.persistence import Base, SQLAlchemyObservationRepository
from inti.infrastructure.persistence.execution import SQLAlchemyExecutionRepository
from inti.infrastructure.persistence.planning import SQLAlchemyPlanRepository
from inti.infrastructure.persistence.recovery import SQLAlchemyRecoveryRepository  # noqa: F401
from inti.infrastructure.persistence.verification import (
    SQLAlchemyVerificationRepository,
)
from inti.infrastructure.storage import LocalArtifactStorage
from inti.infrastructure.verification_evidence import (
    EvidenceIntegrityAdapter,
    InventoryEvidenceCollector,
    LocalEvidenceStorage,
    ReadOnlyInventoryAdapter,
)

READ_TOKEN = "local-test-readonly-capability-value"
FAULT_TOKEN = "local-test-fault-admin-capability-value"
OPERATOR_TOKEN = "local-test-operator-capability-value"


class VerificationHarness:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        demo_path = Path(__file__).resolve().parents[1] / "apps" / "demo-app"
        path = str(demo_path)
        if path not in sys.path:
            sys.path.insert(0, path)
        demo = runpy.run_path(str(demo_path / "server.py"))
        readonly = runpy.run_path(str(demo_path / "verification_server.py"))
        self.controller = demo["FaultController"]()
        self.demo = demo["create_server"](
            "127.0.0.1", 0, self.root / "inventory.db", self.controller
        )
        self.admin = demo["create_fault_server"](
            "127.0.0.1", 0, self.controller, FAULT_TOKEN, self.root / "inventory.db"
        )
        self.readonly = readonly["create_verification_server"](
            "127.0.0.1", 0, self.root / "inventory.db", READ_TOKEN
        )
        self.servers = (self.demo, self.admin, self.readonly)
        self.threads = []
        for server in self.servers:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.threads.append(thread)
        self.demo_url = f"http://127.0.0.1:{self.demo.server_port}/"
        self.admin_url = f"http://127.0.0.1:{self.admin.server_port}/"
        self.readonly_url = f"http://127.0.0.1:{self.readonly.server_port}/"
        config = ConfigurationProvider(
            _env_file=None,
            database_url=f"sqlite:///{self.root / 'inti.db'}",
            artifact_dir=self.root / "artifacts",
            browser_allowed_urls=[self.demo_url],
            demo_url=self.demo_url,
            execution_enabled=True,
            execution_operator_token=OPERATOR_TOKEN,
            browser_worker_token=OPERATOR_TOKEN,
            verification_enabled=True,
            verification_readonly_url=self.readonly_url,
            verification_read_token=READ_TOKEN,
            verification_source_timeout_seconds=0.5,
            verification_source_retries=0,
            browser_timeout_ms=2000,
        )
        self.config = config
        self.observations = SQLAlchemyObservationRepository(
            config.database_url.get_secret_value()
        )
        Base.metadata.create_all(self.observations.engine)
        self.manager = BrowserSessionManager(config)
        storage = LocalArtifactStorage(config.artifact_dir)
        plans = SQLAlchemyPlanRepository(self.observations.engine)
        execution_repository = SQLAlchemyExecutionRepository(self.observations.engine)
        policy = ExecutionPolicy(
            PlanningPolicy((self.demo_url,)), (self.demo_url,), ExecutionLimits()
        )
        model = MetaModelAPIAdapter(config, storage)
        self.execution = ExecutionOrchestrator(
            execution_repository,
            plans,
            self.observations,
            storage,
            self.manager,
            PlaywrightActionExecutor(self.manager),
            policy,
            MetaVisualReasoningAdapter(model, storage, config),
        )
        self.repository = SQLAlchemyVerificationRepository(self.observations.engine)
        evidence_storage = LocalEvidenceStorage(config.artifact_dir / "verification")
        state = ReadOnlyInventoryAdapter(config)
        self.verifier = IndependentVerificationOrchestrator(
            self.repository,
            execution_repository,
            InventoryEvidenceCollector(
                state, ReadOnlyBrowserAdapter(self.manager), config
            ),
            state,
            evidence_storage,
            EvidenceIntegrityAdapter(config),
            self.repository,
            self.readonly_url,
        )

    async def start(self):
        await self.manager.startup()

    async def configure_faults(self, values):
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.admin_url + "faults",
                json=values,
                headers={"Authorization": "Bearer " + FAULT_TOKEN},
            )
            response.raise_for_status()

    def truth(self):
        with closing(
            sqlite3.connect(
                (self.root / "inventory.db").as_uri() + "?mode=ro", uri=True
            )
        ) as connection:
            connection.execute("PRAGMA query_only=ON")
            connection.row_factory = sqlite3.Row
            return [
                dict(row)
                for row in connection.execute(
                    "SELECT id,name,location,status,version FROM assets ORDER BY id"
                )
            ]

    async def approve(self, bundle):
        bundle = await self.execution.approve(
            bundle.session.id, bundle.manifest.digest, "plan", (), "benchmark-operator"
        )
        high = tuple(
            a.id for a in bundle.manifest.actions if a.risk_level == RiskLevel.HIGH
        )
        return await self.execution.approve(
            bundle.session.id,
            bundle.manifest.digest,
            "high_risk",
            high,
            "benchmark-operator",
        )

    async def settle_execution(self, id):
        async with asyncio.timeout(40):
            while True:
                bundle = await self.execution.get(id)
                if bundle.session.status in TERMINAL and id not in self.execution.tasks:
                    return bundle
                await asyncio.sleep(0.03)

    async def settle_verification(self, id):
        async with asyncio.timeout(40):
            while True:
                bundle = await self.verifier.get(id)
                if (
                    bundle.session.status in V_TERMINAL
                    and id not in self.verifier.tasks
                ):
                    return bundle
                await asyncio.sleep(0.03)

    async def scenario(self, faults, source_unavailable=False):
        await self.configure_faults({"seed": 42, **faults})
        before = self.truth()
        approved = await self.approve(
            await SandboxRecipe(self.execution, self.demo_url).prepare()
        )
        await self.verifier.prepare(approved.session.id)
        await self.execution.start(approved.session.id)
        executed = await self.settle_execution(approved.session.id)
        persisted = self.truth()
        if source_unavailable:
            self.readonly.shutdown()
            self.readonly.server_close()
        tick = time.monotonic()
        pending = await self.verifier.create(executed.session.id)
        verification = await self.settle_verification(pending.session.id)
        elapsed = (time.monotonic() - tick) * 1000
        after = self.truth()
        asset_before = next(row for row in before if row["id"] == "PC-104")
        asset = next((row for row in persisted if row["id"] == "PC-104"), None)
        goal = asset is not None and asset["status"] == "Operational"
        unrelated = canonical_bytes(
            [r for r in before if r["id"] != "PC-104"]
        ) == canonical_bytes([r for r in persisted if r["id"] != "PC-104"])
        expected = (
            "INCONCLUSIVE"
            if source_unavailable
            else "VERIFIED_SUCCESS"
            if goal and unrelated
            else "VERIFIED_FAILURE"
        )
        result_by_id = {
            r.criterion_id: r for r in verification.session.criteria_results
        }
        accuracy = []
        for criterion in verification.criteria_version.criteria:
            field, kind = (
                criterion.target_reference.field,
                criterion.assertion_type.value,
            )
            expected_status = (
                "UNKNOWN"
                if source_unavailable
                else ("PASS" if unrelated else "FAIL")
                if field == "inventory_digest"
                else ("PASS" if asset is not None else "FAIL")
                if kind == "exists"
                else (
                    "PASS"
                    if goal and asset["version"] > asset_before["version"]
                    else "FAIL"
                )
                if kind == "state_transition"
                else ("PASS" if goal else "FAIL")
            )
            accuracy.append(
                {
                    "criterion_id": str(criterion.id),
                    "expected": expected_status,
                    "observed": result_by_id[criterion.id].status
                    if criterion.id in result_by_id
                    else "MISSING",
                }
            )
        report = await self.verifier.report(verification.session.id)
        return {
            "recorded_at": datetime.now(UTC).isoformat(),
            "execution_id": str(executed.session.id),
            "verification_id": str(verification.session.id),
            "execution_status": executed.session.status,
            "all_immediate_postconditions_passed": all(
                r.postconditions_satisfied for r in executed.results
            ),
            "goal_persisted_ground_truth": goal,
            "unrelated_assets_unchanged_ground_truth": unrelated,
            "expected_verdict": expected,
            "actual_verdict": verification.session.final_verdict,
            "verification_status": verification.session.status,
            "latency_ms": elapsed,
            "evidence_count": len(verification.evidence),
            "evidence_collection_failures": len(
                [v for v in verification.session.limitations if "UNAVAILABLE" in v]
            ),
            "integrity_failures": sum(
                not item["intact"] for item in report["integrity_checks"]
            ),
            "verifier_changed_inventory": canonical_bytes(persisted)
            != canonical_bytes(after),
            "criterion_results": accuracy,
            "source_available": not source_unavailable,
            "model_calls": 0,
            "report": report,
        }

    async def close(self):
        await self.verifier.shutdown()
        await self.execution.shutdown()
        await self.manager.shutdown()
        for server in self.servers:
            server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join(timeout=2)
        self.observations.engine.dispose()
