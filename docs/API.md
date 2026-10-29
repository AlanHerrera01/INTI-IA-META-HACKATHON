# REST API v1

Application version: 0.2.0. Existing observation routes retain their contracts.

Base URL: `http://localhost:8000/api/v1`. Interactive OpenAPI: `/docs`.
Local single-operator service; no authentication. Keep it bound to loopback.
JSON timestamps use timezone-aware ISO 8601; IDs are UUIDs.

| Method | Route | Behavior |
|---|---|---|
| GET | `/health` | Liveness, version; no dependency checks |
| GET | `/system/status` | Backend, database/schema, Chromium launch checks; ready flag |
| GET | `/models/status` | Configuration and last real inference availability; no probe |
| POST | `/observations/capture` | Capture and persist, returns 201 |
| GET | `/observations?limit=20` | Latest metadata, limit 1–100 |
| GET | `/observations/{id}` | Metadata or 404 |
| GET | `/observations/{id}/screenshot` | image/png or 404 |
| POST | `/observations/{id}/analyze` | Real model interpretation or explicit error |

Capture body (all fields optional):

```json
{"width":1440,"height":900}
```

`url` may specify only an exact configured allowlist entry. Omission uses the
configured demo URL. External URLs produce 422. Width: 320–1920, height: 240–1080.
Artifacts are PNG, viewport-only, max 5,000,000 bytes by default.

Capture/get response fields: `id`, `timestamp`, `source` (`browser`), `source_url`,
`page_title`, `width`, `height`, `screenshot_url`, `analysis_status`, `analysis`.
`screenshot_url` is an API-relative UUID route, never a filesystem path.
`analysis` is null until successful analysis; then contains `model`, `summary`,
`elements` (string array), `ui_state`, `response_id`.

Analyze body:

```json
{"instruction":"Identify the visible inventory controls and UI state."}
```

Instruction: 1–2000 characters, default provided by the API. The selected PNG and
instruction are sent to the configured Meta HTTPS endpoint. A successful result
is persisted; the request never triggers browser clicks, typing, or saving.

Model status: `provider`, `configured`, `available`, `model`, `detail`.
`available=null` means no inference has verified access in this backend process.
True/false reflects the most recent real analysis. A server restart resets it.
No API key, endpoint credentials or database connection string is returned.

Safe application error envelope:

```json
{"error":{"code":"ConfigurationError","message":"Meta is not configured: set META_API_KEY and META_MODEL_ID"}}
```

404 missing observation/image, 422 unauthorized URL or invalid dimensions,
503 missing credentials, 502 upstream/invalid model response/database/browser
failure, 500 unexpected internal failure. Pydantic validation failures retain
FastAPI's standard `detail` array, as documented by generated OpenAPI.

PowerShell smoke test:

```powershell
Invoke-RestMethod http://localhost:8000/api/v1/system/status
$observation = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/observations/capture -ContentType application/json -Body '{}'
Invoke-RestMethod "http://localhost:8000/api/v1/observations/$($observation.id)"
```

## Planning-only endpoints

| Method | Route | Behavior |
|---|---|---|
| POST | `/scenes/interpret` | Stored observation → real Meta structured screenshot scene |
| POST | `/plans/generate` | Scene + intent + typed proposal + deterministic validation; 201 |
| POST | `/plans/{id}/validate` | Revalidate persisted proposal; no model call or execution |
| GET | `/plans/{id}` | Persisted PlanningResult or 404 |
| GET | `/plans?offset=0&limit=20` | Paginated `{items,total,offset,limit}`, limit 1–100 |
| GET | `/plans/{id}/events` | Prompt-free trace for the plan's task |

All routes use `/api/v1`. Scene input: `observation_id` UUID and optional `goal`
(1–2000 characters). Generate input:

```json
{"observation_id":"00000000-0000-0000-0000-000000000001","user_goal":"Find EQ-001 and inspect its current status.","constraints":["Do not change records."]}
```

The UUID above is illustrative; use an existing capture ID. Goal is 1–2000
characters; up to 20 constraints of 1–500 characters. Extra fields, including
`execute`, are rejected. No execute route exists.

Scene output: scene ID, observation ID, viewport, elements, summary, uncertainties,
generated/captured times and optional model usage. Elements contain type, label,
description, visibility, enabled state, optional confidence/box and provenance.
Boxes explicitly declare `pixels` or `normalized_1000`. Source is model_visual or
unresolved; the current adapters never use DOM-assisted grounding.

Generate/get/validate return `PlanningResult`: `plan`, `scene`, `intent`,
`assumptions`, `unresolved_ambiguities`, `warnings`, `model_usage`,
`validation_summary`, `started_at`, `ended_at`, `correlation_id`. Plan includes
UUIDs, original goal, ordered typed actions, status, findings and model metadata.
Each action includes target provenance, whether it needs fresh observation,
typed parameters, preconditions, expected postconditions, explanation and risk.
Risk is LOW/MEDIUM/HIGH/PROHIBITED. Status never authorizes execution.

An unsafe typed proposal can return 201 with status=rejected: creation succeeded
and its rejection is persisted for inspection. Invalid model schemas produce 502
without a fabricated plan. Missing credentials produce 503; missing captures/
artifacts/plans produce 404; invalid user requests produce 422; total model/
planning timeout produces a safe 502. Revalidation can expire a plan based on the
original screenshot age. History/get preserve the last persisted validation;
use revalidation to refresh its age/policy assessment.

Every normal request returns `X-Correlation-ID`; clients may supply a UUID in the
same header to correlate a request. Malformed correlation IDs return 400.
Events expose timestamp, task/plan/correlation IDs, kind, safe code and optional
usage. Token counts absent from provider output remain null. No cost is estimated.
Generation is not idempotent; retrying can create another plan and inference cost.
