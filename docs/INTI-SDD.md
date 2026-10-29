# INTI AI — Software Design Document

Version 0.1.0 · Phase 1 · Ecuador · Meta Global AI Developer Hackathon 2026

## System overview

INTI (Intelligent Navigation, Task Execution & Interaction) establishes the
perception foundation of PERCEIVE → REASON → ACT → VERIFY → RECOVER. Its target
problem is brittle UI automation. Phase 1 captures authorized visual evidence and
can submit it for real model reasoning, without executing actions.

## Requirements

Functional: observe the local synthetic inventory; persist timestamp, source,
title, viewport and artifact reference; retrieve observations and images;
optionally interpret a screenshot through Meta; show actual system diagnostics;
provide usable loading, empty, error and successful states in the dashboard.

Nonfunctional: framework-independent domain, explicit typed boundaries,
async-safe resource ownership, bounded navigation/model timeouts, no secrets in
public responses, restricted local access, repeatable development environment,
lint/type checks, >80% measured domain/application test coverage, honest evidence.

## Components and dependency rules

Domain: `Task`, `Observation`, `AgentAction`, `ExecutionResult`,
`VerificationResult`, `VisionAnalysis`; enums and safe domain exceptions;
browser, vision, repository and artifact protocols. No framework imports.

Application: `CaptureObservationUseCase`, `AnalyzeObservationUseCase`,
`GetSystemStatusUseCase`. Dependencies are domain contracts only. Domain return
objects serve as application DTOs; unused placeholder packages are omitted.

Infrastructure: `ConfigurationProvider` (Pydantic Settings),
`PlaywrightBrowserAdapter`, `MetaModelAPIAdapter`,
`SQLAlchemyObservationRepository`, `LocalArtifactStorage`.

Presentation: FastAPI routes, Pydantic schemas, DI container, safe error mapping.
No ORM/browser objects cross the API. Full dependency discussion is in
[ARCHITECTURE](ARCHITECTURE.md).

## Domain model and persistence

Observation is immutable, UUID identified, timezone-aware, HTTP sourced and bounded
to width 320–1920 and height 240–1080. VisionAnalysis contains model, summary,
visible elements, state and response ID. Task moves pending → running → completed
or failed; terminal transitions are forbidden. Future action contracts require
nonempty targets/details/evidence.

`observations` stores ID, UTC timestamp, source URL, title, viewport, UUID artifact
name, analysis status, and optional normalized response metadata. PNG bytes remain
on disk. Revision `0001` adds the table and timestamp index. Analysis status is
`not_analyzed` or `completed`; in-flight/error states are request-local in Phase 1.
Retries do not create fabricated success records.

## API and data flow

See [API](API.md) for endpoint contracts and examples.

Capture: dashboard POST → request validation → capture use case → Chromium →
allowlisted demo → viewport PNG → artifact storage → PostgreSQL metadata → safe
observation response → same-origin image request → screenshot viewer.

Analysis: observation ID → repository lookup → artifact bytes → documented Meta
image request → validated completion + strict JSON payload → normalized domain
analysis → database update → structured UI display.

## Security and errors

Secrets are environment-only and use redacted SecretStr configuration fields.
`.env`, artifacts and virtualenv are ignored. CORS allows only explicit dashboard
origins. Compose binds exposed services to loopback. Requests forbid extra fields;
UUID references prevent user-selected file access. Artifact symlinks are rejected.
Browser resource requests/redirects are restricted, service workers/websockets
blocked. No user/model JavaScript evaluation, shell execution, or destructive
action endpoint exists. The demo's normal first-party JavaScript is allowed.

Domain errors map to 404 (missing), 422 (navigation policy), 503 (missing Meta
configuration), or 502 (upstream/browser/database failure). Unexpected failures
return a generic 500. Validation returns FastAPI's documented 422 detail list.
Provider bodies, headers, and credentials are never copied into public errors.
The Meta adapter retries only transport failures, 429 and selected 5xx responses,
at most three attempts, within one total request timeout. Long Retry-After values
fail rather than retry too early. Both seconds and HTTP-date Retry-After values
are supported. Status availability reflects only the last call.

The deployment is for a trusted local operator, with no authentication. Before
remote use: authentication, authorization, quotas, OS egress policies and security
review are required. No production readiness claim is made.

## Testing strategy

Unit tests validate entity invariants, transitions, use case behavior and mocked
port substitution. Integration tests cover artifacts, SQLAlchemy roundtrips,
HTTP request payloads, retries, errors and API schemas using isolated fixtures.
Real E2E tests launch Chromium, visit the demo and exercise PostgreSQL-backed
REST capture/retrieval. A separate UI acceptance script checks PNG decoding,
reload persistence, navigation and mobile overflow and writes screenshots.
Frontend component tests cover empty/loading/error/observation/capture states.
CI uses mocks for model requests and requires no production API credentials.
Measured results and exceptions belong in [PHASE-01-REPORT](PHASE-01-REPORT.md).
