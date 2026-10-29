# Development

Current version: 0.2.0, planning only. Existing observation setup remains valid.

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
declarations. Python/frontend package and API versions are now 0.2.0.

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
