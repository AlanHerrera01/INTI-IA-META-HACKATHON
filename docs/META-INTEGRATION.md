# Meta integration verification record

Documentation inspected on 2026-10-28 (America/Bogota). This record distinguishes
verified documentation/request contracts from unverified account access.

| Item | Officially documented contract used |
|---|---|
| Authentication | `Authorization: Bearer <key>` |
| Base URL | `https://api.meta.ai/v1` |
| Endpoint | `POST /chat/completions` relative to base |
| Default model | `muse-spark-1.3` (standard mode) |
| Image | User content block `type=image_url`, nested `image_url.url=data:image/png;base64,...` |
| Structured request | `response_format.type=json_schema`, named schema, strict=true |
| Response | `id`, `model`, `choices[0].message.content`; finish_reason must be stop |
| Normalization | Validate JSON content into summary, elements, ui_state; retain model and response ID |

Other documented standard Spark identifiers include `muse-spark-1.2` and
`muse-spark-1.1`. Contributor variants are deliberately not selected by default;
their content-use terms differ. Availability for this account was not verified.

The inspected rate table listed 3,000 RPM and 4,000,000 TPM per team/model for
standard muse-spark-1.3. The image guide documented at most 50 images per request;
INTI sends one viewport PNG capped locally at 5 MB. These are provider documentation
values, not measured capacity or guaranteed account quota. Re-check before release.

The implementation retries transport failures, 429, 500, 502, 503 and 504, at most
three attempts, with backoff and jitter. Retry-After seconds and dates are honored
within a bounded retry policy; long delays fail without premature retry. One total
timeout bounds the operation. Redirects are not followed. Error bodies, auth
headers and credentials are never logged or returned by the adapter.

`GET /models/status` is configuration + last inference outcome. No undocumented
model-list endpoint or background billable inference probe is invented. On restart,
available is null until the next real call; configured alone does not imply access.

Verified: official documentation accessible; request/image/schema/response contracts
covered by explicit HTTP test fixtures. **Not verified: real inference, token usage,
quality, latency, key validity, billing access or model entitlement.** No valid
credentials were available in this session. Missing key returns HTTP 503 while
capture remains functional. Runtime never uses test fixtures.

Sources:

- [Overview, authentication and models](https://dev.meta.ai/docs/overview)
- [Muse Spark](https://dev.meta.ai/models/muse-spark)
- [Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions)
- [Image understanding](https://dev.meta.ai/docs/image-understanding)
- [Structured output](https://dev.meta.ai/docs/structured-output)
- [Pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits)
