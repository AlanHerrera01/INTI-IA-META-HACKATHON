# INTI AI

**Intelligent Navigation, Task Execution & Interaction**

**See. Reason. Act. Verify.** · Built in Ecuador

[Public repository](https://github.com/AlanHerrera01/INTI-IA-META-HACKATHON)

An autonomous multimodal visual agent foundation for the **Meta Global AI Developer
Hackathon 2026**, **Push the Frontier**, **Indie Developer** track.

Interfaces change. Conventional automation breaks silently. INTI AI's long-term
goal is to perceive an interface, reason about an authorized objective, act,
verify the outcome, and recover when the interface changes.

Phase 1 implements observation and optional real Meta interpretation. It does
not implement autonomous actions, verification of task completion, or recovery.
The loop in the dashboard describes the roadmap; only perception is operational.

## Current functionality

- FastAPI backend with typed domain contracts and dependency-inverted use cases.
- Chromium observation restricted to explicitly configured local demo URLs.
- Real PNG artifacts, persisted observation metadata in PostgreSQL, Alembic migration.
- React dashboard, observation history/detail viewer, responsive layout, live diagnostics.
- Meta HTTP adapter with documented multimodal requests, schema validation,
  bounded retries, safe errors, and explicit missing-credential status.
- Synthetic inventory sandbox with search, editable equipment and session-only save.
- Docker Compose, automated tests, lint/type checks and GitHub Actions configuration.

See [the implementation report](docs/PHASE-01-REPORT.md) for measured results and
the distinction between verified, unverified, blocked, and excluded functionality.

## Start with Docker Desktop

Requirements: Docker Desktop running Linux containers, Docker Compose v2, and
ports 5173, 8000, 8001, 5432 available. Run from the repository root:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
```

Open the [dashboard](http://localhost:5173), [API docs](http://localhost:8000/docs),
or [synthetic demo](http://localhost:8001). Click **Capture observation**. The
backend opens `http://demo:8001/` over the internal Docker network. The host
browser sees the screenshot through the backend; the `demo` hostname does not
need to resolve on Windows. Reload the dashboard to inspect persisted metadata.

All published ports bind to loopback. PostgreSQL and artifacts use named volumes.
`docker compose down` stops the stack and retains those volumes.

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
```

On systems with Make: `make setup`, `make dev`, `make test`, `make lint`,
`make build`. Activate a virtual environment first or set `PYTHON` explicitly.
Detailed setup/troubleshooting: [DEVELOPMENT](docs/DEVELOPMENT.md).

## Architecture and repository

```text
apps/backend/       Python domain, application, adapters, REST API, migrations, tests
apps/frontend/      React/TypeScript dashboard and component tests
apps/demo-app/      Original synthetic inventory sandbox
docs/              Design, API, development and evidence report
benchmarks/         Acceptance scenario and measured verification report
scripts/           Real dashboard verification
.github/workflows/  CI checks without production credentials
```

Stack: FastAPI, Pydantic v2/Settings, HTTPX, Playwright, SQLAlchemy 2.x,
PostgreSQL, Alembic, Pytest, Ruff, MyPy; React, strict TypeScript, Vite,
Tailwind CSS, React Router, TanStack Query, Axios, Lucide; Docker and Actions.
Read [SDD](docs/INTI-SDD.md), [architecture](docs/ARCHITECTURE.md), and [API](docs/API.md).

## Scope and roadmap

This development stack serves one trusted local operator. There is no account
system, remote browsing, action executor, recovery engine, job queue, or production
deployment. Metadata persists; artifacts must be backed up together with the database.
Screenshots are limited to 1920 × 1080 and 5 MB. History returns the latest 20
records by default, up to 100. Meta access and hackathon eligibility must be verified
against the organizer/account before submission. No benchmark result is implied.

Phase 2 prerequisites: verify real Meta access, define explicit task authorization,
action schemas, deterministic outcome evidence, isolated browser sessions,
recovery policies, human approval gates, and adversarial prompt-injection tests.

All project source in this repository was authored for this implementation session.
No proprietary assets or application source were copied. Third-party packages
retain their licenses and are declared in `pyproject.toml` and `package-lock.json`.
Original source is MIT licensed. Public GitHub publication is a separate account
operation; local code and CI configuration alone do not prove public availability.
