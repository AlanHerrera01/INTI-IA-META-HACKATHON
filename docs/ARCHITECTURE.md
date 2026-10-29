# Architecture

Current milestone: Phase 2, planning only. Phase 1 observation is preserved.

Dependencies point inward: presentation → application → domain. Infrastructure
implements domain ports. Domain imports only the Python standard library.
The composition root wires concrete adapters in `presentation/dependencies`.

```mermaid
flowchart LR
    UI[React dashboard] --> API[FastAPI presentation]
    API --> UC[Application use cases]
    UC --> P[Domain ports and entities]
    PW[Playwright adapter] -. implements .-> P
    META[Meta HTTP adapter] -. implements .-> P
    DB[SQLAlchemy repository] -. implements .-> P
    FS[Local artifacts] -. implements .-> P
    PW --> DEMO[Allowlisted local demo]
    DB --> PG[(PostgreSQL)]
```

Domain entities use dataclasses and explicit invariant validation, independent of
Pydantic. `Task` restricts transitions; action/execution/verification contracts are
future-facing data contracts, not claims that action orchestration exists.
Ports are structural Python protocols, enabling typed adapters and test doubles.

Application capture persists metadata after browser capture and removes the PNG
if database persistence fails. This is compensation, not a distributed transaction:
a process crash between the two writes can leave an orphan artifact. Analyze
retrieves an existing observation, calls the vision port and persists the result.
No provider response is fabricated. Analysis failure does not overwrite a prior
successful result. Status probes the database schema and launches/closes Chromium.

Infrastructure stores PNG bytes under UUID-only names, never URL-derived paths.
SQLAlchemy sync sessions run in worker threads; no request-scoped session is shared
across concurrent operations. Database migrations are explicit Alembic revisions;
the server never silently creates tables. Compose migrates before startup.

SOLID: each adapter has one external responsibility; new providers implement ports;
all implementations satisfy the same contracts; browser, vision, repository and
storage ports are separate; application dependencies are injected abstractions.
API schemas map entities to safe public references, hiding ORM rows and paths.

The browser opens fresh isolated contexts and closes the browser in `finally`.
Two captures may run concurrently per server process. Every HTTP resource request
is checked for the exact target origin. Every navigation must match an exact
configured URL; HTTP redirects are refused before following their destinations. Service workers and
websocket egress are blocked; screenshots include the bounded viewport only.
Allowlist hostnames are limited to loopback or the Compose `demo` service.
This application-level restriction assumes a trusted local demo/network; use OS
egress isolation before allowing untrusted pages or configurable remote targets.

The frontend uses TanStack Query for actual backend state, Router for navigation,
and component state for editable instructions. Mutations invalidate relevant
queries. Screenshots use backend same-origin proxy references. UI statuses do not
derive from synthetic metrics. Analysis text is rendered as text, never raw HTML.

Tradeoffs: no queue, no distributed lock, one local operator, short history window,
no authentication. PostgreSQL is required in the live stack; SQLite is only an
isolated repository/API test fixture. A filesystem and database backup must remain
consistent. Production hardening and autonomous actions are out of Phase 1 scope.

## Reasoning and planning extensions

`domain/planning.py` contains framework-independent dataclasses for viewport,
bounding boxes, visual elements/scenes, task intent, action targets/parameters,
planned actions, plans, findings, usage and events. `planning_ports.py` isolates
reasoning, intent, planning, grounding, policy, repository and telemetry behavior.
No action executor is defined or injected into planning use cases.

Generation composes scene interpretation, task interpretation, plan proposal and
deterministic validation within one total timeout. The original goal/constraints
are retained even if the model tries to rewrite them. Visual and planning Meta
adapters share the Phase 1 authenticated transport, retries, timeout, response cap
and usage normalization. Wire schemas/JSON codecs stay outside the domain.

Visual grounding checks screenshot identity, viewport and estimated box bounds.
All model-based results explicitly say model_visual or unresolved. DOM-assisted
claims are rejected because no independent DOM matcher is implemented. Confidence
is uncalibrated; valid bounds do not prove correct localization.

The deterministic policy enforces parameter allowlists, known target references,
element types, visible/enabled state, preconditions, expected evidence, URL scope,
unsafe-operation restrictions and fresh-observation checkpoints. High-risk steps
carry future-human-approval findings. Expiry is based on screenshot/plan age.
`valid` is a planning judgment, never an execution authorization.

The plan repository shares the existing SQLAlchemy engine. `visual_scenes` stores
scene snapshots; `action_plans` stores complete inspection results;
`planned_actions` indexes ordered action type/risk; `planning_events` stores
prompt-free correlated traces. Plan, action index and completion event commit in
one transaction. Revalidation updates the same plan row and appends an event.
Failure events before a plan exists remain correlated by task/request in logs/DB.

```mermaid
flowchart TD
    R[Observation ID + goal + constraints] --> O[Load stored observation and PNG]
    O --> V[Meta screenshot interpretation]
    V --> G[Validate viewport and estimated grounding]
    G --> S[(Persist scene)]
    S --> I[Meta intent interpretation]
    I --> P[Meta typed action proposal]
    P --> D[Deterministic policy validation]
    D --> Status{Planning status}
    Status --> Valid[valid]
    Status --> Clarify[requires_clarification]
    Status --> Reject[rejected]
    Status --> Expired[expired]
    Valid --> DB[(Atomic plan + action index + completion event)]
    Clarify --> DB
    Reject --> DB
    Expired --> DB
    DB --> UI[Inspect timeline, grounding, uncertainty and trace]
    UI --> Stop[Stop: no execution capability]
```

This remains local synchronous HTTP orchestration, not a durable job queue.
Generation is non-idempotent: repeated requests create distinct plans and can
incur additional inference cost. Revalidation is state-idempotent and intentionally
appends audit events. Cancellation stops coroutine orchestration, but cannot
forcibly interrupt a database write already running in a worker thread.
