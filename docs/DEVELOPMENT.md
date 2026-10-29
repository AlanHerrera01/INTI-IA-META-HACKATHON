# Development

Current version: 0.3.0, authorized sandbox execution. Existing observation/planning
setup remains valid. Execution is disabled until its capability tokens are configured.

## Phase 3 on Windows and Docker Desktop

Use Linux containers. Copy `.env.example` only if `.env` does not already exist;
preserve existing credentials. Generate two separate random values with
`python -c "import secrets; print(secrets.token_urlsafe(32))"`, put them in
`EXECUTION_OPERATOR_TOKEN` and `BROWSER_WORKER_TOKEN`, then set `EXECUTION_ENABLED=true`.
Keep these local. The operator token is entered into Live Execution; the worker
token stays between services. Browser connections use a first-frame capability,
not URL credentials. Tokens are kept in React memory and disappear on reload.

```powershell
docker compose up --build -d
docker compose ps
docker compose logs --tail 50 browser-worker backend
```

Open `http://localhost:5173/execution`. The worker has no published port and its
network has no external gateway. Only backend/demo share that network; PostgreSQL
stays on the default network. Do not attach host folders or credentials to the
worker. Its writable temporary files are disposable. `demo-data` persists the
inventory SQLite database across container rebuilds; no automatic reset exists.

Native development (separate terminals, activated venv):

```powershell
python apps/demo-app/server.py --host 127.0.0.1 --port 8001 --db artifacts/demo/inventory.db
python -m uvicorn inti.worker:app --host 127.0.0.1 --port 8010
python -m alembic -c apps/backend/alembic.ini upgrade head
python -m uvicorn inti.main:app --host 127.0.0.1 --port 8000
npm --prefix apps/frontend run dev
```

Native worker execution is for trusted local development and does not provide
Docker network/memory isolation. Compose is the demonstrated deployment boundary.
Native settings use `http://127.0.0.1:8001/`; Compose overrides URL/worker addresses.
Configuration defaults and bounds appear in `.env.example` and `/docs` schemas.
Compose forwards action, time, context, navigation, artifact and TTL limits;
worker memory/PID caps are in `docker-compose.yml`.

Run baseline plus credential-free browser integration tests:

```powershell
python -m playwright install chromium
python -m pytest apps/backend/tests -m "not e2e" --cov=inti.domain --cov=inti.application --cov-fail-under=80
python -m ruff check apps/backend scripts
python -m ruff format --check apps/backend scripts
python -m mypy --config-file apps/backend/pyproject.toml apps/backend/src
npm --prefix apps/frontend test
npm --prefix apps/frontend run lint
npm --prefix apps/frontend run build
```

On restricted Windows temp directories, create `.tmp` and add
`--basetemp=.tmp/phase3-tests -p no:cacheprovider` to pytest. Tests create new demo
SQLite databases and stop their own servers/browsers; no Meta call is required.
CI installs Chromium with OS dependencies, runs those browser tests on Linux and
checks at least 80% domain/application statement coverage.

For the explicit demonstration against the running Compose stack:

```powershell
python scripts/verify_execution.py --run-sandbox
```

This opt-in harness reviews the known authored sandbox recipe programmatically,
submits exact plan and separate HIGH approvals using the configured local operator
capability, pauses/resumes it, and checks the saved store and a fresh browser.
Its recorded actor is the configured test operator, not a claim of interactive
human confirmation. It refuses to reset an already changed PC-104. UI operators
normally review the two confirmation dialogs themselves. To inspect an existing
completed run and regenerate UI evidence without writes, omit `--run-sandbox`.
JSON metrics and desktop/mobile screenshots go under ignored `artifacts/phase3/`.
The successful original run's metrics are also included in `docs/evidence/`.

Backend startup migrates through 0003. Interrupted live executions fail with
PROCESS_RESTART; READY/AWAITING_APPROVAL records may continue after revalidation.
Use one Uvicorn process, not multiple workers. Do not downgrade a populated database:
0003 downgrade removes execution history and its privacy marker. Upgrade/downgrade
tests use temporary databases and preserve legacy observations. Artifact metadata
and PNG backups should be kept together. Never use volume deletion to rerun a demo.

Run commands from the repository root. Recommended: Docker Desktop Linux engine
and `docker compose up --build -d`. See [README](../README.md) for native commands.
Native Python 3.12+ and Node 22.12+ are supported; the backend Docker image uses
Python 3.12. Install development dependencies with `pip install -e 'apps/backend[dev]'`.
Use the committed npm lockfile with `npm ci`.
`apps/backend/requirements-dev.lock` records exact versions measured on Windows;
use it as optional pip constraints (`-c`) when reproducing that environment.

## Configuration

Pydantic Settings loads `.env` relative to the process working directory; start
native commands from the root. Environment variables override the file. Lists
(`BROWSER_ALLOWED_URLS`, `CORS_ORIGINS`) require JSON arrays, not comma-separated
strings. Meta base URL must be HTTPS without embedded credentials. The model ID
is configurable; use one enabled for your account.

Native demo URL is exactly `http://127.0.0.1:8001/` (including trailing slash).
Compose uses exactly `http://demo:8001/`. `localhost` and `127.0.0.1` are distinct
allowlist targets. New remote hosts are intentionally rejected by configuration.
Only local trusted demo content should ever be added.

`POSTGRES_PASSWORD=inti` is a development-only default. For Compose, use a unique
URL-safe password in `.env`; when running natively also update `DATABASE_URL`.
Existing PostgreSQL volumes retain the password set on first initialization.
Changing the environment does not rotate an existing database user's password.

## Commands without Make on Windows

| Make target | PowerShell / Compose equivalent |
|---|---|
| setup | Create venv; install backend dev extra; install Chromium; `npm --prefix apps/frontend ci` |
| dev | `docker compose up --build` |
| test | Pytest and `npm --prefix apps/frontend test` (README commands) |
| lint | Ruff check + format check, MyPy, frontend lint + typecheck |
| build | `docker compose build` |

For native Python use `.\.venv\Scripts\python.exe`. If Windows venv ensurepip is
blocked, the global pip can bootstrap it with
`python -m pip --python .venv install -e 'apps/backend[dev]'`.
Activate the venv before `make` or pass `PYTHON` explicitly.

## Migrations and resources

Native: `python -m alembic -c apps/backend/alembic.ini upgrade head`. Compose runs
the same revision automatically before Uvicorn. `backend` reaches PostgreSQL at
`postgres:5432` and demo at `demo:8001` through the Compose bridge network.
Backend and demo containers run as unprivileged users. PostgreSQL's official
image performs its standard initialization/user drop. Frontend is a development
Vite server; the Dockerfile also verifies its production build.

`docker compose ps` and `docker compose logs --tail 100 backend` diagnose startup.
Health checks cover service liveness; `/system/status` checks database schema and
actual browser availability. Named volumes preserve DB and PNGs across restarts.
Back up both together. Do not delete volumes when troubleshooting valuable data.
Native execution writes to the host `ARTIFACT_DIR`; Compose writes to its named
artifact volume. When sharing a database between these modes, migrate the PNGs
with the metadata or use separate databases. Otherwise old records will reference
images that are absent in the other storage location.

## Verification

Unit/integration tests default to isolated SQLAlchemy SQLite fixtures and mocked
HTTP/browser ports. The live E2E path uses real PostgreSQL and real Chromium:

```powershell
$env:INTI_E2E='1'
.\.venv\Scripts\python.exe -m pytest apps/backend/tests/e2e -v
.\.venv\Scripts\python.exe scripts/verify_dashboard.py
```

The first E2E test directly visits the host demo; the second uses the running API
(native or Docker). UI evidence goes in ignored `artifacts/verification/`.
No test sends a real Meta inference request. Model fixtures are test-only.

## Troubleshooting

- Docker pipe access denied: verify Docker Desktop is running and the terminal
  has access to its Linux engine. This agent environment required execution
  outside its initial process sandbox; normal terminals may not.
- Chromium download certificate errors: use your organization's trusted root
  certificate or `NODE_OPTIONS=--use-system-ca` when supported by the bundled
  Node runtime. Never disable TLS verification.
- `spawn EPERM` or denied temporary directories: OS/application sandbox blocked
  child processes or cache writes. Run the checks from an authorized terminal.
- Ready=false: verify database/schema migration, `docker compose ps`, and that
  Chromium was installed under the same user running the backend.
- Capture 422: exact local allowlist mismatch; check URL, port and trailing slash.
- Capture 502: demo unavailable, navigation timeout, browser dependency failure,
  or artifact size limit. Verify demo URL independently and browser installation.
- Model 503: no key configured. Model 502: credentials, quota, unsupported model,
  network, timeout or invalid provider payload. Raw provider bodies are deliberately
  excluded from public errors.
- Port in use: stop the project's native server before starting the equivalent
  Compose service. Do not run both on port 8000/5173 simultaneously.

## Hackathon provenance and release

Original source was implemented in this repository during the recorded session;
dependencies are third-party packages, not original submissions. Verify event
dates/eligibility and Meta account access independently. CI is configured but
cannot run on GitHub until the repository is pushed. Do not publish credentials,
artifacts containing sensitive data, or claim verified model access without a
real call. No image push or deployment is included.

## Phase 2 development and verification

Rebuild/restart: `docker compose up --build -d`. Backend startup upgrades Alembic
0001 → 0002, adding visual_scenes, action_plans, planned_actions and planning_events.
Native migration command remains `python -m alembic -c apps/backend/alembic.ini upgrade head`.
Do not downgrade a populated live planning database: downgrade removes Phase 2
tables. Automated downgrade tests use an isolated temporary database and preserve
Phase 1 observations.

The backend Dockerfile caches dependency/Chromium installation before copying
application source, reducing repeat rebuild cost without changing dependency
declarations. Phase 2 introduced version 0.2.0; Phase 3 is version 0.3.0.

Planning settings are in `.env.example` and forwarded by Compose. Tokens/retries
are bounded per model call; an overall timeout bounds the three-stage pipeline.
Screenshot age controls expiry, so capture a fresh observation before generating
an inspection plan. The default threshold is not a calibrated probability of
successful localization. No new infrastructure dependencies were introduced.

Run `python scripts/benchmark_planning.py` for clearly labeled synthetic policy
fixtures. This is also checked by CI without credentials. For billable live
integration, explicitly set `INTI_LIVE_MODEL_TESTS=1` and run
`pytest apps/backend/tests/e2e/test_live_planning.py -v` with the full stack running.
Missing configuration skips that test and remains an external blocker.

Real PostgreSQL planning persistence can be checked without a paid model call:
set `INTI_POSTGRES_TESTS=1` and run
`pytest apps/backend/tests/e2e/test_postgres_planning.py -v`. The test uses explicitly
mocked model ports and a newly generated temporary schema, then removes only that
schema. It never writes synthetic plans into the application's normal history.

`python scripts/verify_planning_workspace.py` first checks the real local planning
page/configuration, then intercepts HTTP responses inside the test browser to
exercise successful plan visualization. Fixture screenshots say TEST FIXTURE and
are stored under `artifacts/verification/phase-02/`; no fake plan is written into
the runtime service/database. No generated action is executed by this script.

Planning telemetry logs structured UUID/event/usage data, never prompts or raw
provider failures. Supply `X-Correlation-ID` as a UUID for cross-request tracing.
Failure events without a completed plan are stored by task/correlation ID; they
are not shown in successful-plan history. Revalidation appends trace events but
does not invoke Meta. Repeated generation requests are distinct, potentially
billable operations; there is no server idempotency key or durable job queue.
