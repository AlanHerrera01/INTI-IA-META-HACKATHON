# REST API v1

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
