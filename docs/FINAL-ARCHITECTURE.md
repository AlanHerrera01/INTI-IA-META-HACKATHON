# INTI AI — Final Architecture

Version: 0.7.0 · Phase 7 · Local single-operator release

This document describes the architecture that actually exists in this repository.
It distinguishes what is exercised end-to-end from what is gated, fixture-based or
unavailable. It does not claim a production deployment or live Meta performance.

## 1. Product boundary

INTI AI turns an objective into an inspectable mission:

```text
objective → observation → plan → explicit approval → browser execution
          → fault detection → bounded recovery → independent verification
          → evidence and benchmark inspection
```

The released product targets one trusted local operator and one synthetic
inventory application. It is not a general-purpose remote browsing service.

## 2. Runtime topology

`docker-compose.yml` starts six loopback-only services:

| Service | Role | Published port | Trust boundary |
|---|---|---|---|
| `postgres` | Durable missions, plans, executions, recovery and verification records | 5432 | Database credentials |
| `demo` | Synthetic inventory UI plus restricted fault administration | 8001 (UI), 8002 (admin) | `DEMO_FAULT_CONTROL_TOKEN` |
| `inventory-state` | Read-only SQLite snapshot plane for the independent verifier | none | Read-only mount |
| `backend` | FastAPI domain/application/presentation API | 8000 | `EXECUTION_OPERATOR_TOKEN`, `VERIFICATION_READ_TOKEN` |
| `browser-worker` | Isolated Chromium action worker | none | `BROWSER_WORKER_TOKEN` |
| `frontend` | React Mission Control workspace | 5173 | Operator token held in memory |

Named volumes: `postgres-data`, `artifacts`, `demo-data`. The isolated networks
include `browser-sandbox` and `verification-plane`. All host bindings use `127.0.0.1`.

The browser worker has no host port. The verifier does not share the execution
browser session and reads persisted state through the read-only plane.

## 3. Code layers

```text
apps/backend/src/inti/
  domain/          Typed entities, policies, ports, error contracts
  application/     Use cases and orchestration (planning, execution, recovery,
                   verification, missions, sandbox recipe)
  infrastructure/  SQLAlchemy repositories, Playwright adapter, Meta adapter,
                   demo control client, evidence storage, configuration
  presentation/    FastAPI routers, request/response models, capability guards
apps/frontend/src/
  app/             Shell, routing, operator context
  pages/           Mission Control, Planning, Execution, Recovery, Verification,
                   Benchmark Lab, Observations, System
  components/      Shared UI and metric components
  features/        Domain-specific inspectors and badges
  services/        Typed API clients
  styles/          Design tokens and workspace styles
```

Dependency direction is inward: presentation and infrastructure depend on
application/domain contracts, not the reverse.

## 4. Mission lifecycle

A mission has a stable UUID that links observation, plan, execution, recovery,
verification and evidence.

| Phase | Persisted state | Meaning |
|---|---|---|
| Created | `CREATED` | Objective accepted; nothing has run |
| Preparing | `PREPARING` | Observation/plan generation in progress |
| Plan ready | `PLAN_READY` | Plan and execution bundle exist; no approval implied |
| Execution | execution session state | Approval, start, pause, resume, cancel are separate |
| Recovery | recovery session state | Bounded diagnosis/repair after a detected failure |
| Verified | verification session state | Independent verdict from fresh persisted state |

Preparation is serialized by a service gate. A failed preparation stores an explicit
`error_code` and never substitutes a plan.

### Planning modes

- `authored_demo`: an explicitly authored nine-step PC-104 recipe. It uses real
  Chromium observations and actions but no model reasoning. It is accepted only for
  the supported PC-104 → Operational objective.
- `meta`: the real Meta observation/planning pipeline. If
  `MISSION_MODEL_CALLS_ENABLED=false` or Meta is not configured, preparation fails
  with `MODEL_CALLS_DISABLED` or a configuration error. No fallback plan is created.

## 5. Approval and execution

Execution authorization is deliberately split:

1. The plan manifest has a digest.
2. The operator approves the exact manifest (`scope=plan`).
3. HIGH-risk actions are approved separately by action ID (`scope=high_risk`).
4. Start revalidates the live session.
5. The browser worker performs real actions against the configured synthetic URL.
6. Execution completion is recorded separately from outcome verification.

`COMPLETED` means the approved steps finished and immediate checks passed. It does
not mean the business outcome is verified. The verification report owns that verdict.

## 6. Recovery

Recovery is bounded and gated:

- Live recovery requires `RECOVERY_ENABLED=true`, real Meta access and
  `MISSION_MODEL_CALLS_ENABLED=true`.
- The demo fault (rename/relocate Save) is armed through the restricted admin plane,
  not through operator credentials.
- Recovery proposals require their own review and HIGH-action approval.
- Retry/cancel are explicit; budgets and attempts are persisted.

In this environment real Meta access is unavailable. The recovery mechanics are
therefore demonstrated by the explicitly labeled fixture-based integration test in
`apps/backend/tests/integration/test_missions.py`. The fixture supplies diagnosis
only; browser execution, fault injection, repair actions and verification remain
real. No live-model recovery is claimed.

## 7. Independent verification

The verifier:

- defines versioned criteria and a baseline before execution;
- reads fresh persisted state after execution through the read-only plane;
- evaluates deterministic criteria;
- stores evidence with SHA-256 integrity checks;
- produces `VERIFIED_SUCCESS`, `VERIFIED_FAILURE` or `INCONCLUSIVE`;
- never treats execution completion or an optimistic UI as proof.

Verification reports expose criteria results, evidence IDs, integrity checks and
limitations. Historical runs with missing baselines remain explicitly unknown.

## 8. Mission Control API

Public capability discovery:

```text
GET /api/v1/capabilities
GET /api/v1/health
GET /api/v1/models/status
```

Operator-authorized mission routes:

```text
POST /api/v1/missions
GET  /api/v1/missions
GET  /api/v1/missions/{id}
POST /api/v1/missions/{id}/prepare
POST /api/v1/missions/{id}/execution
POST /api/v1/missions/{id}/demo-fault
GET  /api/v1/mission-control
GET  /api/v1/demo/status
POST /api/v1/demo/reset
```

Existing planning, execution, recovery, verification and benchmark routes remain
available. `/api/v1/mission-control` aggregates recent missions, executions,
verdicts, persisted activity with source labels, and backend capability flags.

Demo mutation routes (`/demo/status`, `/demo/reset`) require
`DEMO_CONTROLS_ENABLED=true`. Reset requires the current synthetic store UUID and
the literal confirmation `RESET PC-104`; it refuses while executions or verification
are active.

## 9. Data and migrations

Alembic revision `0006_missions` adds the `missions` table with:

- `id`
- `execution_id` (unique FK)
- `plan_id` (FK)
- `updated_at`
- `version` (optimistic concurrency)
- `payload` (typed mission JSON)

Earlier revisions cover observations, plans, executions, recovery and verification.
The database is the source of truth; artifacts and screenshots must be backed up
with it.

## 10. Frontend and design system

React 19, React Router 7, TanStack Query, Axios, Lucide and Vitest.

Design tokens in `apps/frontend/src/styles/index.css`:

| Token | Value |
|---|---|
| `--bg` | `#0B1220` |
| `--surface` | `#111C2E` |
| `--primary` | `#06B6D4` |
| `--solar` | `#F59E0B` |
| `--success` | `#22C55E` |
| `--error` | `#EF4444` |
| `--text-primary` | `#F8FAFC` |
| `--text-secondary` | `#94A3B8` |

Alpha variants use `color-mix(in srgb, var(--token) N%, transparent)`. The shell
provides a skip link, visible focus outlines, responsive navigation, live health
dots and reduced-motion handling.

Mission Control adds:

- backend-derived guided demo tracker with `NEXT` and `BLOCKED` states;
- latest independent verdict card;
- capability status card that distinguishes enabled features from unavailable ones;
- persisted activity labeled by source (execution/planning/recovery/verification);
- benchmark metrics with explicit `Unavailable` values.

## 11. Benchmark evidence

The Benchmark Lab reads only allowlisted, committed reports:

- `benchmarks/reports/phase-05-verification.json`
- `benchmarks/reports/phase-02-policy.json`

The backend computes each file's SHA-256 for identification, validates ratio shapes and rejects
missing or malformed files. Missing reports are listed as unavailable; no example
scores are generated.

Current measured verification report (5 deterministic fault trials):

| Metric | Result |
|---|---|
| Expected verdict agreement | 5 / 5 |
| Verified task success | 1 / 5 |
| False-positive detection | 3 / 3 |
| Inconclusive | 1 / 5 |
| Criteria evaluation accuracy | 25 / 25 |
| Mean verification latency | ~3290 ms |
| Model calls | 0 |

This is a fault-mix result, not a model-reliability or comparative-agent estimate.
Phase 6 comparative evaluation does not exist. Recovery success rate, execution
latency and unsafe-action counts remain `Unavailable`.

## 12. Degradation behavior

| Missing capability | Observable behavior |
|---|---|
| No operator token | Protected pages show a connect prompt; APIs return auth errors |
| Execution disabled | UI disables start; API returns a configuration error |
| Verification disabled | Verification routes report unavailability; no verdict is fabricated |
| Meta key/model calls disabled | Meta mission preparation returns `MODEL_CALLS_DISABLED`; authored mode remains available and labeled |
| Live recovery unavailable | Fault arming returns `LIVE_RECOVERY_BLOCKED`; guided tracker marks recovery `BLOCKED` |
| Demo controls disabled | Reset controls are hidden/disabled; demo routes return a configuration error |
| Benchmark file missing | Report is listed as unavailable; no placeholder scores |

## 13. Reproducibility

```powershell
# One-command local demo (builds images, enables demo controls, preserves volumes)
powershell -ExecutionPolicy Bypass -File .\scripts\start_demo.ps1 -BuildCaPem .\.tmp\build-ca.pem

# Real authored end-to-end check; writes docs/evidence/phase7-live-demo.json
.\.venv\Scripts\python.exe scripts\live_demo_check.py

# Genuine screenshots from the running UI
.\.venv\Scripts\python.exe scripts\capture_demo_screenshots.py
```

`-BuildCaPem` is only needed on networks with TLS interception. The script never
disables TLS verification.

## 14. Known limitations

- One operator, one synthetic target, no account system or multi-tenancy.
- Live Meta planning/recovery cannot be verified without credentials and budget.
- No Phase 6 comparative evaluation; no statistical reliability claim.
- No durable distributed job queue; execution tasks are in-process.
- Artifact retention and backup are operational responsibilities.
- Prompt-injection and concurrent-writer evaluations remain future work.
- Local trials do not establish hackathon eligibility or production readiness.

## 15. Clean-data release check

Run `powershell -ExecutionPolicy Bypass -File .\scripts\verify_clean_start.ps1` after building images. It exports release files, creates fresh capabilities and volumes in a unique temporary project, checks empty history and the initial asset, runs the real authored scenario, then removes only its temporary project/volumes. It preserves the main stack and history. This checks fresh data/configuration with built images, not empty-cache installation. Evidence: `docs/evidence/phase7-clean-start.json`.
