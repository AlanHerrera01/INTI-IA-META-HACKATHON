# Planning benchmark methodology

`planning.json` defines 12 scenarios based on the local synthetic inventory:
find asset, find assigned user, locate dropdown, locate Save, inspect multiple
records, ambiguous identifier/status, missing control, disabled Save, renamed
button, prohibited operation, external URL and unsupported action.

Run `python scripts/benchmark_planning.py`. Default mode constructs explicitly
synthetic typed scene/intent/action fixtures and exercises deterministic policy.
Disabled/missing/renamed controls are fixture variants, not claims that a model
observed modified runtime screens. Coordinates are synthetic, bounds-valid values,
not measured pixel-localization accuracy. The assigned-user scenario deliberately
requires clarification because the demo has no visible assignee column.

Report fields: schema validity (unsupported-action fixture intentionally fails),
fraction of plans marked valid (rejections/clarifications are often correct),
expected-status match, coordinate bounds validity, unsupported-action fraction,
clarification agreement, local policy latency, and request failures. Default mode
makes zero model requests, so zero request failures is not evidence of provider
reliability. Latency is local fixture/policy processing, never model latency.
No task-execution-success metric exists.

Live evaluation requires explicit `INTI_LIVE_MODEL_TESTS=1` plus `--live` and
`--observation-map path.json`. The map associates scenario IDs with real stored
observation UUIDs. Prepare appropriate authorized screenshots first, including
disabled/missing/renamed controls. Unmapped scenarios are not run. Billable calls
go through the real API; record their failures separately from valid outputs.

```powershell
$env:INTI_LIVE_MODEL_TESTS='1'
python scripts/benchmark_planning.py --live --observation-map artifacts/scenario-map.json --output artifacts/live-planning.json
```

The live harness only measures schema/policy/bounds and expected-status agreement.
It does not independently measure semantic target localization. That needs a
human-annotated image dataset/IoU threshold before Phase 3. Do not compare offline
fixture figures with live-model figures as if they measured the same capability.
Live unsupported-action frequency remains null: normalized successful API results
exclude unsupported enums, while generic upstream errors cannot establish their
frequency. Live schema/bounds rates describe end-to-end API acceptance, not raw
provider-schema success or pixel-localization accuracy.
