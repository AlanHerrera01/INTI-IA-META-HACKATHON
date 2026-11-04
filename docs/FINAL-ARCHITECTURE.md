> Default runtime update: the local-computer mode now runs PostgreSQL, backend and frontend, plus an outbound Windows agent on the host. See [README](../README.md). It supports an explicitly authored, digest-approved text-file/Notepad/browser sample with no model calls. The architecture below documents the optional inventory sandbox (`docker-compose.legacy.yml`), whose data is retained.

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
                   Analytics & Benchmarks, Observations, System
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
| `--bg` | `#0C1321` |
| `--surface` | `#19202E` |
| `--primary` | `#4CD7F6` |
| `--solar` | `#FFB95F` |
| `--success` | `#4AE176` |
| `--error` | `#FFB4AB` |
| `--text-primary` | `#DCE2F6` |
| `--text-secondary` | `#BCC9CD` |

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

The Analytics & Benchmarks reads only allowlisted, committed reports:

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

The desktop frontend follows the supplied Stitch HTML, with a 288px sidebar, 64px top bar, local Geist/Inter/JetBrains Mono fonts, task ledger, bounded activity view and read-only model/settings views. See [design decisions](FRONTEND-DESIGN-REVIEW.md) for exact palette provenance and deliberate exclusions.

AI Agent Studio (`/planning`) provides the directive editor, compact typed plan tree, focused action inspector and evidence/provenance panels. It loads persisted plans without executing them. Protected observation metadata and screenshots use the operator capability; screenshots are displayed through temporary object URLs. Generation and scene interpretation require both configured model access and the server's model-call capability. Planning grants no execution authority.

The Docker frontend serves its compiled `dist` using the local Vite preview server on port 5173, retaining the API and WebSocket proxies. Development outside Docker uses `npm run dev`. Serving compiled assets avoids mixing cached development dependency chunks after rebuilding or switching local servers.

Visual Observations (`/observations`, `/observations/:id`) combines the latest public captures with operator-authorized evidence referenced by the latest ten plans. Its desktop workbench provides a searchable gallery, raw/recorded-bounds display, viewport facts, recorded element provenance and PNG export. Bounds require a matching observation ID and viewport and valid coordinates; selecting a target does not execute it. Protected screenshot object URLs are revoked on replacement/unmount. Missing FPS, latency, segmentation masks and model interpretation remain explicitly unavailable.

Live Execution (`/execution`) arranges the approved action stream, protected browser frame and recorded state/trace/verification in three desktop columns. Connecting opens the latest saved execution for inspection. Terminal records keep execution commands disabled and label screenshots as saved evidence. Approval dialogs freeze the reviewed digest and actions and reject a changed selection or manifest. Event state is scoped to execution and operator; WebSocket and REST maintain separate cursors, and stale responses are ignored. Step counts use the latest result per manifest action; recorded timing samples exclude invalid durations. Task success continues to come from the independent report, not execution completion alone.

Task Manager (`/tasks`) displays the paginated mission ledger and a focused evidence inspector. It requests at most twenty mission details for the loaded page, using each detail's revalidated independent report. Lifecycle/search/date/preparation filters and recovered/verified counters are scoped to that page; only the stored-task total is global. Failed refreshes and mismatched mission IDs cannot supply evidence or success badges. The inspector reuses the protected observation viewer, latest-result execution metrics and existing mission/execution/verification links. JSON downloads describe the visible ledger scope or selected task detail and do not contain the operator capability.

Recovery Center (`/recovery`) presents protected before/fresh screenshots around a recorded five-stage pipeline, with scoped metrics, events, diagnoses and audit facts. Missing recovery records remain explicitly empty. The resolved-case ratio excludes cancelled/escalated sessions; duration samples require valid closed-session timestamps. Case/capability changes remount the event stream and revoke screenshot object URLs. Plan/HIGH approval uses the reviewed digest and snapshot, while cancellation and budget-permitted retry require explicit confirmation. A failed case refresh cannot retain evidence or active commands. Recovery success remains separate from independent task verification. The current browser evidence covers an empty real history; non-empty states and authorization flows use unit fixtures, without real model calls.

Hardware & IT Inventory (`/inventory`) is a native connected-app catalog over the existing sandbox records. A frontend server adapter exposes only exact GET/HEAD `/inventory-data`, maps it to the fixed configured origin's `/api/inventory`, rejects writes/extra paths/query routing and redirects, and validates the returned asset schema. `INVENTORY_PROXY_TARGET` defaults to localhost:8001 for native development and demo:8001 in Docker. The adapter is installed in both Vite dev and compiled-preview servers. No backend or sandbox endpoints, DOM, allowlist or persisted rows change. The view provides full-snapshot filters, five-row pagination, current-record inspection and JSON downloads; stale data is withdrawn on read failure. Versions are not represented as audit seals, and unsupported custody/specification/certification/history fields remain explicitly unrecorded.

Verification Lab (`/verification`) displays selected-case criterion/evidence/integrity metrics, a four-stage recorded pipeline, approved expected values beside protected observed artifacts, and a paginated historical ledger. Only a revalidated report matching verification, execution, criteria version and digest can provide the effective verdict or report export. Report, case and artifact refresh failures withdraw their respective cached content. History outcomes are explicitly historical. Operator/case changes remount scoped events and protected artifact viewers; temporary image URLs are revoked. Execution/verification deep links survive operator connection. Cancellation and fresh evidence collection require confirmation; inspection and integrity rechecks use read-only endpoints. Unsupported visual-accuracy/OCR/pHash claims from the mockup are omitted.

AI Models (`/models`) has a dedicated desktop view over existing public read-only model, capability, system and observation endpoints. It distinguishes local adapter configuration, the last real analysis availability and task-request permissions. A refresh performs dependency diagnostics and reads status, never provider inference. Performance/VRAM/precision remain unmeasured; host GPU/RAM telemetry is unavailable. Cards identify the single configured model adapter and actual supporting grounding, browser and independent verification services without claiming SAM or fallback models. The side panel displays real server switches and the latest public saved observation with explicit capture/analysis provenance. Source refresh failures withdraw cached statuses or frames. Configuration guidance names local environment variables without credential entry, registry operations or routing writes. Settings has its own desktop configuration view described below.


Settings (`/system`) provides module filters around a desktop operator/vision/inventory/sandbox layout. It reads the existing public model status, capability switches, dependency checks and fixed read-only inventory catalog. Configured credentials, last-analysis availability, enabled feature policy and dependency readiness remain distinct. Unknown or failed sources withdraw their cached values and disable complete diagnostic export. Export selects an explicit public field set and excludes operator capability, input draft, extra API fields and asset rows. Operator access uses the shared in-memory context; loading clears the password input, disconnect clears access, route navigation preserves it and reload clears it. It does not establish personal identity or persist browser storage. Unsupported server-setting saves, editable routing thresholds, webhook/profile/ERP operations and global halt controls are omitted; configuration stays in the local environment and per-execution controls link to Live Execution. No backend, environment or original inventory data changes are introduced.


Analytics & Benchmarks (`/benchmarks`) separates archived verifier trials from synthetic planning-policy fixtures through a source selector. Four source-specific metrics retain original denominators and reported means; different methodologies are not combined. An interactive discrete latency bar chart uses valid finite nonnegative per-scenario samples in source order, with keyboard sample selection and explicit millisecond units. It does not imply time trends, pipeline phase timings or model performance. Outcome cards and a searchable scenario table expose archived results; table filters preserve report metric scope. Harness IDs are inspected as archived JSON, not routed into the current workspace execution store. Exports include parsed report data and provenance, while copy uses the backend file SHA-256, explicitly distinct from export bytes and certification. Refresh errors withdraw cached reports and actions, and an explicitly selected missing source is not silently replaced. Empty, invalid or unmeasured data remains explicit. Model leaderboards, unsupported workloads, live throughput and run-suite operations from the mockup are omitted. Browser QA reads existing sources only and does not start evaluations or mutate inventory, server flags or reports.


Activity Logs (`/activity`) presents the existing protected recent-event window with five loaded-window counters, source/type/text/time filters, six-entry client pagination, compact cards and an exact metadata inspector. Identity is scoped by source and event ID because forwarded events may appear in multiple streams; counters do not imply global uniqueness, 24-hour totals or security status. The endpoint supplies only ID, source, type and timestamp, so payloads, parent-session links, frames, severity, signing identities and cryptographic proofs are not fabricated. Source links open general workspaces rather than claiming exact-session association. JSON export selects only the four permitted fields with filter/count/read-time scope, and omits overview data, operator capability and raw search text. CSV uses quoting and spreadsheet-formula neutralization. Failed reads and capability changes withdraw cached selection and export access. This view polls under an independent query key, so its automatic reads can pause while shell diagnostics continue; manual refresh remains available and no server execution is paused. Browser acceptance verifies the frozen read timestamp over a full interval, metadata copy, scoped exports, three desktop widths and capability clearing on reload without any HTTP writes or Meta calls.
