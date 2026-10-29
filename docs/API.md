# REST API v1

Application version: 0.3.0. Existing observation routes retain their contracts.

Base URL: `http://localhost:8000/api/v1`. Interactive OpenAPI: `/docs`.
Local single-operator service. Execution routes and execution evidence require a
Bearer capability; ordinary Phase 1/2 inspection routes remain local and public.
Keep published services bound to loopback.
JSON timestamps use timezone-aware ISO 8601; IDs are UUIDs.

## Authorized execution API

Enable execution and configure separate operator/worker tokens as described in
[Development](DEVELOPMENT.md). Every route in this table requires
`Authorization: Bearer <EXECUTION_OPERATOR_TOKEN>`; identities come from server
configuration, never a request's claimed approver. No token appears in a response.

| Method | Route relative to `/api/v1` | Behavior |
|---|---|---|
| POST | `/executions` | Prepare an exact frozen plan/contract manifest; 201 |
| POST | `/executions/demo/prepare` | Observe actual controls and persist the explicitly authored PC-104 recipe; 201 |
| POST | `/executions/{id}/approve` | Approve plan or separately confirm exact HIGH action IDs |
| POST | `/executions/{id}/start` | Require READY, revalidate and schedule once; 202 |
| POST | `/executions/{id}/pause` | Request pause after current cycle |
| POST | `/executions/{id}/resume` | Require PAUSED and revalidate original live browser |
| POST | `/executions/{id}/cancel` | Persist cancellation and revoke browser; terminal requests are idempotent |
| GET | `/executions/{id}` | Session, frozen manifest, decisions, results and browser metadata |
| GET | `/executions/{id}/actions` | Recorded action results |
| GET | `/executions/{id}/events?after=0` | Persisted sequence-ordered events, maximum 1000 per response |
| GET | `/executions?offset=0&limit=20` | Paginated history, limit 1–100 |

Prepare request example (replace IDs with actual values and provide one contract
for every planned action):

```json
{
  "plan_id": "00000000-0000-0000-0000-000000000001",
  "grounding_mode": "hybrid_dom",
  "contracts": [{
    "planned_action_id": "inspect-search",
    "target": {"role":"textbox","name":"Search equipment","selector":null},
    "preconditions": [{"kind":"visible","target":{"role":"textbox","name":"Search equipment"},"expected":null}],
    "postconditions": [{"kind":"visible","target":{"role":"textbox","name":"Search equipment"},"expected":null}]
  }]
}
```

Modes: `hybrid_dom`, `selector_based`, `visual_only`. Selector mode requires exact
approved `[data-testid="..."]` selectors. Visual mode never silently uses DOM.
Checks: visible/enabled; input_value/selected_option/text with expected strings;
url with expected exact allowlisted URL and null target. Original natural-language
plan conditions remain proposals; the approved typed contracts are executed.

Approve body: `{"manifest_digest":"<64 hex chars>","scope":"plan","action_ids":[]}`.
This approves LOW/MEDIUM only. Then submit `scope:"high_risk"` with the exact HIGH
UUIDs. Start remains blocked until both decisions exist. Editing the plan or any
manifest data invalidates approval. Every decision records actor, timestamp, reason
and digest. The browser worker accepts only server-authorized actions via a separate
private capability. That private token is never used by the frontend.

Missing/invalid operator capability returns 401; disabled/unconfigured execution
returns 503; missing records 404; malformed schemas 422; policy/state/concurrency
violations 409 with safe codes such as APPROVAL_REQUIRED, APPROVAL_INVALIDATED,
PLAN_EXPIRED, DUPLICATE_START, TARGET_UNRESOLVED or TARGET_AMBIGUOUS. Worker transport
errors are sanitized. Actions never retry automatically, including uncertain effects.

Execution captures have `restricted=true` internally: get, screenshot and analyze
require the operator capability, and public observation listings exclude them.
Fetch PNGs with authenticated headers and display a temporary blob URL. Artifact
paths and capabilities are never embedded in public screenshot URLs.

WebSocket `/ws/executions/{id}` validates allowed Origin when supplied. Send
`{"token":"<operator capability>","after":0}` as the first frame within 5 seconds.
The server replays persisted events and then streams new ones. Use event `sequence`
as reconnect cursor and `id` for deduplication; continue REST pagination when a
batch reaches 1000. Terminal streams close 1000 after draining history. Authentication
or missing-session failures close 4401; denied origins close 4403. Tokens never go
in query strings. The development proxy forwards both `/api` and `/ws`.

Events include execution_created, approval_required, authorization_rejected, plan_approved,
high_risk_approved, execution_started, browser_session_opened, action_started,
observation_captured, action_completed, action_failed, pause_requested,
execution_paused, execution_resumed, execution_cancelled, execution_completed,
execution_failed (including TIMED_OUT) and browser_session_closed. Payloads contain
safe IDs, indices and codes. Results distinguish dispatch completion, immediate
checks and uncertain effects; `overall_goal_verified` remains false in this phase.

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
`execute`, are rejected. Execution uses the separate protected routes below.

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
