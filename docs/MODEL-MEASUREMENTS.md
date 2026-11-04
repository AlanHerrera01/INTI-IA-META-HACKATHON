# Model measurements

AI Models reads numeric telemetry from `GET /api/v1/models/status`. Refreshing,
opening the dashboard, or polling status never calls the provider. Measurements
are persisted in `artifacts/model-metrics.sqlite3` and limited to the latest 200
logical requests for the configured model. Mock/injected transports are marked
as fixtures and excluded from live aggregates. No request content, image,
credential or generated text is saved in this telemetry.

- Latency: arithmetic mean of successful end-to-end requests, including network,
  any retry/backoff in normal requests and response/schema validation. This is
  not GPU inference time or time to first token. Failures are counted separately.
- Throughput: sum of provider-reported output tokens divided by total elapsed
  time of successful requests with usage counters. Missing usage stays unknown.
- Localization: fraction of valid synthetic calibration responses whose point
  lies inside the known target. A miss counts as zero. Invalid responses are
  failed calls, not localization samples. This narrow hit-rate check does not
  establish real desktop grounding precision; the sample count is shown.
- GPU memory: unavailable because this client has no provider GPU telemetry.
  The paired computer's GPU is not the hosted model's GPU.

The explicit calibration button asks for confirmation, then calls operator-only
`POST /api/v1/models/evaluate` with `{"confirm_real_call":true}`. It sends one
generated 512x320 PNG with a green target and requests a pixel coordinate. It
has zero automatic retries and a 512-token output cap, and can consume provider
quota. No desktop capture or local file is sent. It bypasses the automatic model
call switch only for this explicitly requested calibration; task execution and
authored plan provenance remain unchanged.

Access is verified only after a valid response. A configured key alone is not
proof of access. HTTP failure codes are recorded without provider response text
or secrets. A changed key requires backend recreation to reload its environment.

On a network with a private certificate authority, use
`scripts/start_computer.ps1 -BuildCaPem <trusted-ca-bundle.pem>`. The supplied PEM
is used for package builds and mounted as a read-only runtime secret for HTTPS
provider requests. Include the needed trust roots in that bundle. Certificate
verification remains enabled; neither the bundle nor `.env` belongs in Git.

Transport reference: [Meta Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions).
