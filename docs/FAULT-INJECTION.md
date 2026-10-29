# Reproducible local fault injection

Faults are disabled by default. A separate optional bearer capability enables
`POST http://127.0.0.1:8002/faults` in Compose. The execution worker only authorizes
the ordinary demo origin/port and does not receive this token. Never expose the
administration port beyond loopback. Test harnesses use clearly test-only tokens.

Send a JSON object with `seed: 42` and bounded options. Each request replaces the
configuration with defaults plus the supplied options and increments a version.
An empty object disables injected faults. The UI receives presentation settings,
never administration credentials or the backend target override. UI polling is
one second; external tests wait for the visible fault to apply before dispatch.

| Fault option | Effect |
|---|---|
| move_save | Seeded displacement of Save |
| save_label | Bounded alternate visible label |
| modal | Workspace notice covering the form |
| render_delay_ms | Save hidden for a bounded interval |
| disable_control_ms | Save temporarily disabled |
| reorder_fields / reorder_columns | Reorders existing form/table controls |
| navigation_path | Only local `/inventory` alias |
| duplicate_save | Ambiguous duplicate Save control |
| reject_updates + optimistic_on_reject | Backend rejects; UI still shows receipt |
| mutation_target_override | Updates a different syntactically valid synthetic asset |
| optimistic_only | UI receipt/status changes without a write request |

Recovery tests inject moved/renamed/modal/delayed/ambiguous controls between the
fresh execution observation and dispatch. Four recover with explicit fixture
diagnoses; ambiguity escalates with no write/model call. Changed scope gets new
plan and HIGH approval. Each successful trial checks SQLite version 2 to rule out
a duplicate save. These are browser/coordinator integration tests, not live-model
visual-reasoning measurements.

Verification tests use actual Chromium, application SQLite and the separate
read-only gateway. A/B/C produce VERIFIED_FAILURE despite COMPLETED execution;
D stops the source and produces INCONCLUSIVE; E persists and verifies success.
Verdicts are derived from evidence, never fault names. The harness independently
reads SQLite for ground truth and compares inventory before/after verification.

Reproduce from the repository root:

```powershell
.venv/Scripts/python.exe -m pytest apps/backend/tests/integration/test_recovery_faults.py -q
.venv/Scripts/python.exe -m pytest apps/backend/tests/integration/test_verification_faults.py -q
.venv/Scripts/python.exe scripts/benchmark_verification.py
```

The benchmark writes aggregate and raw reports under `benchmarks/reports` and
private artifacts under ignored `artifacts/verification-benchmark`. Each trial
uses a new store. It does not reset or mutate the existing Compose inventory.
