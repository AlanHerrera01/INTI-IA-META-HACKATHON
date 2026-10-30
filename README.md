# INTI AI

**Intelligent Navigation, Task Execution & Interaction**

**See. Reason. Act. Verify.** · Built in Ecuador

[Public repository](https://github.com/AlanHerrera01/INTI-IA-META-HACKATHON)

An autonomous multimodal visual agent foundation for the **Meta Global AI Developer
Hackathon 2026**, **Push the Frontier**, **Indie Developer** track.

Interfaces change. Conventional automation breaks silently. INTI AI's long-term
goal is to perceive an interface, reason about an authorized objective, act,
verify the outcome, and recover when the interface changes.

Version 0.7 completes the product experience. Mission Control turns an objective
into one inspectable mission: observation, plan, explicit approvals, real browser
execution, bounded recovery, independent verification and evidence. Approved typed
plans run in an isolated Chromium worker; a separate read-only source checks what
the application actually persisted. The lifecycle is
PERCEIVE → REASON → PLAN → ACT → RECOVER → VERIFY.

Execution completion, immediate UI checks and VERIFIED_SUCCESS are separate
results. Five actual browser/database fault trials produced the expected verdicts:
three VERIFIED_FAILURE, one INCONCLUSIVE and one VERIFIED_SUCCESS. No live Meta
calls were made for these phases, as requested. Recovery diagnosis is implemented
but evaluated with explicit test fixtures; live-model performance remains blocked.
Phase 6 comparative evaluation does not exist and is not claimed.

## Recovery and independent verification

- [Recovery Center](http://localhost:5173/recovery): private evidence, budgets,
  diagnosis, reviewed repair plans and separate HIGH action approvals.
- [Verification Center](http://localhost:5173/verification): versioned criteria,
  fresh read-only evidence, deterministic results, history and reports.
- [Verification engine](docs/VERIFICATION-ENGINE.md) and [evidence model](docs/EVIDENCE-MODEL.md).
- [Phase 4 report](docs/PHASE-04-REPORT.md), [Phase 5 report](docs/PHASE-05-REPORT.md),
  [measured benchmark](benchmarks/reports/phase-05-verification.json).

Generate distinct random capabilities in ignored `.env`:
`EXECUTION_OPERATOR_TOKEN`, `BROWSER_WORKER_TOKEN`, `VERIFICATION_READ_TOKEN` and
`DEMO_FAULT_CONTROL_TOKEN` (at least 24 characters each). `scripts/start_demo.ps1`
enables `EXECUTION_ENABLED`, `VERIFICATION_ENABLED`, `RECOVERY_ENABLED` and
`DEMO_CONTROLS_ENABLED`, and copies `DEMO_FAULT_CONTROL_TOKEN` into
`DEMO_CONTROL_TOKEN` for the restricted demo admin plane. Compose preserves existing
volumes and runs migrations through `0006`. The `inventory-state` service has no
published port and mounts application data read-only.

Connect with the operator token in Live Execution, review and approve the authored
sandbox plan and its HIGH save action, then start. Automatic verification defines
criteria/baseline before execution and evaluates fresh persisted state afterward.
Historical terminal runs can also be verified; missing historical baselines remain
explicitly unknown. The authored recipe is not represented as model reasoning.

## Mission Control and the Phase 7 experience

- [Mission Control](http://localhost:5173): create a task, follow one mission ID,
  inspect plan provenance, approve execution, review recovery, and read the latest
  independent verdict.
- **Guided demo** (`/?guided=1`) derives an eight-step tracker from backend state.
  Completed steps, the next step and blocked dependencies are real states; the guide
  cannot approve or start anything.
- [Benchmark Lab](http://localhost:5173/benchmarks) shows committed reports with
  denominators and explicit `Unavailable` metrics. It does not invent comparative
  scores.
- Synthetic reset is restricted to the marked demo store, requires confirmation and
  refuses while execution or verification is active.
- A public [capabilities endpoint](http://localhost:8000/api/v1/capabilities)
  reports feature switches without exposing secrets.

Real Phase 7 evidence:

- [live demo evidence](docs/evidence/phase7-live-demo.json): authored mission,
  nine real browser actions, independent `VERIFIED_SUCCESS`, eight intact evidence
  items, persisted `PC-104 = Operational`, and an explicit
  `MODEL_CALLS_DISABLED` Meta dependency check.
- [Phase 7 report](docs/PHASE-07-REPORT.md), [final architecture](docs/FINAL-ARCHITECTURE.md),
  [judge guide](docs/JUDGE-DEMO-GUIDE.md), [QA checklist](docs/QA-CHECKLIST.md),
  [submission notes](docs/SUBMISSION.md), [video script](docs/DEMO-VIDEO-SCRIPT.md)
  and [storyboard](docs/DEMO-STORYBOARD.md).
- Genuine screenshots from the running stack are in
  [`docs/screenshots/`](docs/screenshots/).

## Current functionality

- FastAPI backend with typed domain contracts and dependency-inverted use cases.
- Chromium observation restricted to explicitly configured local demo URLs.
- Real PNG artifacts, persisted observation metadata in PostgreSQL, Alembic migration.
- React dashboard, observation history/detail viewer, responsive layout, live diagnostics.
- Meta HTTP adapter with documented multimodal requests, schema validation,
  bounded retries, safe errors, and explicit missing-credential status.
- Synthetic inventory sandbox with search, record dialogs and persistent SQLite saves.
- Docker Compose, automated tests, lint/type checks and GitHub Actions configuration.
- AI Planning workspace: goals, constraints, estimated visual overlays, action
  timelines, uncertainty, risk, validation, paginated history and correlated events.
- Deterministic policy: bounded steps, exact URL restrictions, fresh-observation
  checkpoints, prohibited-operation rejection and screenshot-based plan expiry.

- Live Execution workspace with exact-manifest approval, separate HIGH confirmation,
  pause/resume/cancel, private screenshot evidence, history and persisted WebSocket events.
- Mission Control product shell with one mission identity, backend-derived guided
  tracker, latest verdict, capability status and source-labeled activity.
- Benchmark Lab for allowlisted, shape-validated local reports with computed SHA-256 with explicit
  unavailable metrics and no inferred scores.
- Restricted synthetic reset and an explicitly gated live-fault path. No fixture is
  substituted when Meta access is missing.

See [the Phase 3 implementation report](docs/PHASE-03-REPORT.md) for measured results and
the distinction between verified, unverified, blocked, and excluded functionality.

## Start with Docker Desktop

Requirements: Docker Desktop running Linux containers, Docker Compose v2, and
ports 5173, 8000, 8001, 8002, 5432 available. Run from the repository root:

```powershell
Copy-Item .env.example .env
# Fill in distinct random capabilities in .env (at least 24 characters each):
# EXECUTION_OPERATOR_TOKEN, BROWSER_WORKER_TOKEN, VERIFICATION_READ_TOKEN,
# DEMO_FAULT_CONTROL_TOKEN
powershell -ExecutionPolicy Bypass -File .\scripts\start_demo.ps1
docker compose ps
```

On a network with TLS interception, pass the trusted CA explicitly:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_demo.ps1 -BuildCaPem .\.tmp\build-ca.pem
```

Open the [dashboard](http://localhost:5173/?guided=1), [API docs](http://localhost:8000/docs),
or [synthetic demo](http://localhost:8001). Connect with `EXECUTION_OPERATOR_TOKEN`,
then follow **Guided demo**. The backend opens `http://demo:8001/` over the internal
Docker network. The host browser sees screenshots through the backend; the `demo`
hostname does not need to resolve on Windows.

`start_demo.ps1` enables execution, verification, recovery mechanics and restricted
demo controls, generates missing capabilities, and checks backend version `0.7.0`.
It preserves existing volumes; reset explicitly in Mission Control when you want a
fresh synthetic state.

All published ports bind to loopback. PostgreSQL, artifacts and demo data use named volumes.
`docker compose down` stops the stack and retains those volumes.

## Authorized sandbox execution

Execution is disabled by default. Set `EXECUTION_ENABLED=true` in your ignored `.env`,
and generate separate `EXECUTION_OPERATOR_TOKEN` and `BROWSER_WORKER_TOKEN` values:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Run that command twice and copy the values into the corresponding settings. Recreate
the services with `docker compose up -d`. Open [Live Execution](http://localhost:5173/execution),
enter your operator token, then **Prepare PC-104 sandbox**. Review **Approve Plan**,
confirm the HIGH Save action separately, then start. Pause takes effect after the
current observation/action cycle; resume revalidates the live session. Cancellation
closes the browser and preserves any application changes already committed.

The deterministic demo recipe is explicitly authored, uses actual accessible DOM
observations and calls no model. It is not presented as a Meta-generated plan.
PC-104 starts Inactive in a new demo database and is saved as Operational by browser
interaction. Repeating the original recipe after that change fails its Inactive
precondition; it never silently resets user data. Use **Reset demo** in Mission
Control (or the restricted API) to restore the marked synthetic store. Ordinary
automated tests use fresh temporary stores.

Existing Phase 2 plans can be loaded with typed target/precondition/postcondition
contracts in the advanced editor or API. Business ambiguity, stale plans and rejected
plans are blocked. Approved runtime observation checkpoints resolve future controls
only after new screenshots. `COMPLETED` records finished steps and immediate checks;
the engine keeps `overall_goal_verified=false`. The verification harness separately
checks the demo store and a fresh browser reload. See [API](docs/API.md) and
[development instructions](docs/DEVELOPMENT.md).

## Meta configuration

Set `META_API_KEY` in `.env` to a valid Meta Model API key with model access.
Defaults: `META_MODEL_ID=muse-spark-1.3`,
`META_API_BASE_URL=https://api.meta.ai/v1`, request timeout 60 seconds.
Then recreate the backend:

```powershell
docker compose up -d --force-recreate backend
```

**Analyze with Meta** sends the selected synthetic screenshot to Meta and returns
the actual interpretation. No runtime mock or fallback interpretation exists.
Configured means a key exists; availability remains unverified until a real
analysis succeeds or fails. Status polling never makes billable inference calls.

The adapter follows Meta's official [authentication/model documentation](https://dev.meta.ai/docs/overview),
[image input](https://dev.meta.ai/docs/image-understanding),
[Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions), and
[structured output](https://dev.meta.ai/docs/structured-output).
Never commit `.env` or paste credentials into issues. The API exposes no keys.

## Planning-only workflow

Capture a fresh observation, open **AI Planning**, select the observation and
enter an objective/constraints. **Interpret scene** requests visual understanding;
**Generate Plan** requests scene interpretation, intent and action decomposition,
then applies deterministic validation. Inspect visual overlays, explicit
requirements, assumptions, ambiguities, risk, preconditions and expected evidence.
Review persisted history or revalidate without another model request.

Meta credentials are required for real reasoning. Without them, the workspace
shows configuration guidance and APIs return explicit errors, not sample plans.
`valid` means the proposal passed structural/policy checks; it never grants
execution authorization or proves model coordinates are correct. Future targets
and stale screenshots require clarification or a fresh observation.

Limits: `PLANNING_MAX_STEPS=20`, `PLANNING_MAX_RETRIES=2` per model call,
`PLANNING_MAX_TOKENS=4096` output tokens per call,
`PLANNING_TIMEOUT_SECONDS=120` for the generation pipeline,
`PLANNING_TTL_SECONDS=900` measured against screenshot age,
`PLANNING_MIN_CONFIDENCE=0.6`, `META_MAX_RESPONSE_BYTES=262144` per response.
At most three successful model stages occur per generation; retry bounds also
apply. Missing usage counters remain unavailable; no cost estimate is fabricated.

```powershell
# Offline synthetic policy fixtures, no paid calls:
.\.venv\Scripts\python.exe scripts/benchmark_planning.py
# Explicit opt-in with a configured Meta account; API charges can apply:
$env:INTI_LIVE_MODEL_TESTS='1'
.\.venv\Scripts\python.exe -m pytest apps/backend/tests/e2e/test_live_planning.py -v
```

Offline benchmark figures measure policy regression, not Muse Spark accuracy or
task-execution success. See [methodology](benchmarks/scenarios/PLANNING.md).

## Native development and checks

Python 3.12+ and Node 22.12+ are required. Use a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "apps/backend[dev]"
.\.venv\Scripts\python.exe -m playwright install chromium
npm --prefix apps/frontend ci
docker compose up -d postgres demo
.\.venv\Scripts\python.exe -m alembic -c apps/backend/alembic.ini upgrade head
.\.venv\Scripts\python.exe -m uvicorn inti.main:app --host 127.0.0.1 --port 8000
# In a second terminal:
npm --prefix apps/frontend run dev
```

Use the default local values in `.env.example` for native execution. Compose
overrides the database and demo addresses with service hostnames.

```powershell
.\.venv\Scripts\python.exe -m pytest apps/backend/tests -m "not e2e" --cov=inti.domain --cov=inti.application --cov-fail-under=80
.\.venv\Scripts\python.exe -m ruff check apps/backend
.\.venv\Scripts\python.exe -m ruff format --check apps/backend
Push-Location apps/backend
..\..\.venv\Scripts\python.exe -m mypy
Pop-Location
npm --prefix apps/frontend run lint
npm --prefix apps/frontend test
npm --prefix apps/frontend run build
# With all services running:
$env:INTI_E2E="1"
.\.venv\Scripts\python.exe -m pytest apps/backend/tests/e2e -v
.\.venv\Scripts\python.exe scripts/verify_dashboard.py
# Real authored mission + independent verification (no model calls):
.\.venv\Scripts\python.exe scripts/live_demo_check.py
# Genuine screenshots from the running app:
.\.venv\Scripts\python.exe scripts/capture_demo_screenshots.py
```

On systems with Make: `make setup`, `make dev`, `make test`, `make lint`,
`make build`. Activate a virtual environment first or set `PYTHON` explicitly.
Detailed setup/troubleshooting: [DEVELOPMENT](docs/DEVELOPMENT.md).

## Architecture and repository

```text
apps/backend/       Python domain, application, adapters, REST API, migrations, tests
apps/frontend/      React/TypeScript Mission Control workspace and component tests
apps/demo-app/      Synthetic inventory sandbox with restricted fault administration
docs/              Architecture, API, demo guides, evidence and phase reports
benchmarks/         Acceptance scenarios and measured verification reports
scripts/           Startup, live demo check, screenshot capture and verifiers
.github/workflows/  CI checks without production credentials
```

Stack: FastAPI, Pydantic v2/Settings, HTTPX, Playwright, SQLAlchemy 2.x,
PostgreSQL, Alembic, Pytest, Ruff, MyPy; React, strict TypeScript, Vite,
Tailwind CSS, React Router, TanStack Query, Axios, Lucide; Docker and Actions.
Read [SDD](docs/INTI-SDD.md), [architecture](docs/ARCHITECTURE.md), and [API](docs/API.md).

## Scope and roadmap

This development stack serves one trusted local operator. Execution uses local
capability tokens, not an account system. Remote browsing, general-purpose recovery,
a durable job queue and production deployment remain outside scope.
Metadata persists; artifacts must be backed up together with the database.
Screenshots are limited to 1920 × 1080 and 5 MB. History returns the latest 20
records by default, up to 100. Meta access and hackathon eligibility must be verified
against the organizer/account before submission. Local deterministic benchmarks
do not establish live-model performance.

Phase 7 delivered the product shell, Mission Control workflow, restricted demo
reset, benchmark inspection, live demo evidence and submission documentation. The
Phase 6 comparative evaluation remains unimplemented. Remaining work: evaluate real
Meta planning/recovery quality with configured access, add explicit criterion
authoring for additional applications, distributed ownership, artifact retention
and stronger prompt-injection/concurrent-writer evaluations.

Submission status: no demo video URL or hackathon form submission is claimed. See
[docs/SUBMISSION.md](docs/SUBMISSION.md). Local evidence does not prove organizer
eligibility or acceptance.

All project source in this repository was authored for this implementation session.
No proprietary assets or application source were copied. Third-party packages
retain their licenses and are declared in `pyproject.toml` and `package-lock.json`.
Original source is MIT licensed. Public GitHub publication is a separate account
operation; local code and CI configuration alone do not prove public availability.
