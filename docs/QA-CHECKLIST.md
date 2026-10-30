# INTI AI — Phase 7 QA Checklist

Date: 2026-10-29–30 · Release: 0.7.0 · Environment: Windows, Docker Desktop Linux
containers, local loopback only.

Legend: `[x]` verified · `[ ]` not done or not applicable · **BLOCKED** requires an
external dependency.

## 1. Repository and release hygiene

- [x] Work performed in the existing repository, not a replacement app.
- [x] Version is `0.7.0` in backend, frontend package and health endpoint.
- [x] Alembic migration `0006_missions` is present and the stack migrates on start.
- [x] `.env` remains gitignored; no capability token is committed or printed in docs.
- [x] Existing routes and Phase 1–5 functionality are preserved.
- [x] No screenshot, benchmark, model usage or URL was fabricated.
- [x] Phase 7 implementation committed and pushed as `a4c85d6`; evidence is delivered in a separate documentation commit.
- [ ] Public release verification from a clean clone (not performed here).

## 2. Build and static checks

- [x] Frontend typecheck: `npm run typecheck` passed.
- [x] Frontend lint: `npm run lint` passed.
- [x] Frontend tests: 6 files, 33 tests passed.
- [x] Frontend production build: `npm run build` passed.
- [x] Backend targeted mypy: 6 changed modules passed.
- [x] Backend full mypy: 63 source files passed.
- [x] Backend targeted ruff: changed modules passed.
- [x] Targeted mission integration tests: 3 passed.
- [x] Full non-e2e backend suite: 223 passed, 5 deselected; coverage 89.66%.
- [x] Backend full ruff check: all checks passed.
- [x] Backend full ruff format: 108 files already formatted.
- [x] Opt-in browser/API/PostgreSQL E2E: 4 passed, 1 live-model test skipped.

## 3. Docker stack

- [x] `docker compose ps` shows postgres, demo, inventory-state, backend,
      browser-worker and frontend healthy.
- [x] Backend health reports `0.7.0`.
- [x] Capabilities report execution, verification, recovery and demo controls
      enabled.
- [x] Model calls and model configuration report unavailable (no key configured).
- [x] All published ports bind to `127.0.0.1`.
- [x] `scripts/start_demo.ps1` builds, starts, waits for health and checks version.
- [x] TLS-intercepted build works with `-BuildCaPem`; TLS verification is not
      disabled.
- [x] Rebuild after Phase 7 changes succeeded.

## 4. Product experience

- [x] Mission Control is the default route and shows the mission lifecycle.
- [x] Navigation has distinct icons, active states and a skip link.
- [x] Top bar reports backend, Meta, active executions and version from live data.
- [x] Guided demo tracker derives state from the backend.
- [x] Tracker distinguishes done, next and blocked; it grants no approval.
- [x] Latest verdict card validates stored evidence integrity; corruption yields INCONCLUSIVE.
- [x] Capability status card separates enabled features from unavailable ones.
- [x] Recent activity labels its source (execution/planning/recovery/verification).
- [x] Benchmark Lab shows denominators and explicit `Unavailable` metrics.
- [x] Mobile layout hides non-essential health metadata and keeps navigation usable.
- [x] Reduced-motion preference disables animation and transitions.

## 5. Task workflow

- [x] Objective input accepts a bounded task and creates a mission.
- [x] Authored mode is explicitly labeled “no model”.
- [x] Meta mode without access fails with `MODEL_CALLS_DISABLED`.
- [x] No fallback plan is substituted for a failed Meta preparation.
- [x] Preparation produces one plan and one execution bundle linked to the mission.
- [x] Plan inspector shows actions, risk, provenance and model usage count.
- [x] Approval requires the exact manifest digest.
- [x] HIGH-risk save requires a separate approval.
- [x] Start is a separate action after both approvals.
- [x] Execution results and durations are persisted.

## 6. Real execution smoke test

- [x] `scripts/live_demo_check.py` ran against the rebuilt stack.
- [x] Reset established `PC-104 = Inactive` on the marked synthetic store.
- [x] Nine authored actions ran in the real browser worker.
- [x] Execution reached `COMPLETED`.
- [x] Independent verification reached `VERIFIED_SUCCESS`.
- [x] Eight evidence items passed integrity checks.
- [x] Persisted state showed `PC-104 = Operational`.
- [x] A Meta mission failed explicitly with `MODEL_CALLS_DISABLED`.
- [x] Evidence written to `docs/evidence/phase7-live-demo.json`.

## 7. Recovery

- [x] Recovery code paths and budgets are implemented.
- [x] Live recovery is gated on enabled Meta calls and model access.
- [x] Fault arming returns `LIVE_RECOVERY_BLOCKED` without those dependencies.
- [x] Fixture-based integration test injects a real fault and performs a real
      browser repair with real verification.
- [x] The fixture is explicitly labeled as diagnosis-only, not live Meta.
- **BLOCKED** Live Meta rename/relocate recovery was not exercised (no key/budget).
- [ ] Recovery success rate measurement (does not exist).

## 8. Verification and evidence

- [x] Criteria and baseline are defined before execution.
- [x] The verifier reads fresh persisted state through a read-only plane.
- [x] Verdicts are `VERIFIED_SUCCESS`, `VERIFIED_FAILURE` or `INCONCLUSIVE`.
- [x] Evidence SHA-256 integrity is checked and displayed.
- [x] Execution completion is not treated as verification.
- [x] Historical missing baselines remain explicitly unknown.
- [x] The verifier made zero inventory mutations in the committed report.

## 9. Demo reset and safety

- [x] Reset requires `DEMO_CONTROLS_ENABLED=true`.
- [x] Reset requires the current synthetic store UUID.
- [x] Reset requires the literal confirmation `RESET PC-104`.
- [x] Reset refuses while execution or verification is active (`DEMO_BUSY`).
- [x] Reset only touches the marked synthetic store; evidence and benchmarks remain.
- [x] Demo fault administration uses a separate token from operator/worker tokens.
- [x] The browser worker has no host port and is isolated.
- [x] The verifier plane is read-only.

## 10. Documentation and submission

- [x] `README.md` updated for 0.7 and Phase 7.
- [x] `docs/FINAL-ARCHITECTURE.md`.
- [x] `docs/SUBMISSION.md`.
- [x] `docs/DEMO-VIDEO-SCRIPT.md`.
- [x] `docs/DEMO-STORYBOARD.md`.
- [x] `docs/JUDGE-DEMO-GUIDE.md`.
- [x] `docs/QA-CHECKLIST.md`.
- [x] `docs/PHASE-07-REPORT.md`.
- [x] Screenshots captured from the running app.
- [ ] Demo video recorded (no video URL claimed).
- [ ] Hackathon form submitted (no submission claimed).
- [ ] Organizer rules/eligibility independently confirmed.

## 11. Cleanup before handoff

- [x] Final demo left PC-104 Operational with verified evidence; explicit reset remains available.
- [ ] Stop the stack with `docker compose down` if not demonstrating.
- [x] Review `git status` and identify the intended Phase 7 files.
- [x] Implementation committed/pushed; final evidence is versioned separately. No owner approval is pending.
- [x] No capability token was exposed during recording; no rotation needed.
- [x] Confirm no `.env`, artifact, or screenshot contains a secret.

## 12. Known issues

1. **Live Meta planning/recovery is unverified.** No `META_API_KEY` and
   `MISSION_MODEL_CALLS_ENABLED=false`.
2. **No comparative evaluation.** Phase 6 was not implemented; the UI says so.
3. **`declared_overall_goal_verified` remains false** on the authored execution even
   when the independent criteria verdict is `VERIFIED_SUCCESS`. This is the existing
   execution/verification separation, not a hidden success claim.
4. **Single process execution tasks.** No durable distributed queue; a backend
   restart interrupts in-process tasks.
5. **Live-model E2E skipped intentionally.** Four real browser/API/PostgreSQL tests passed; no paid model call was enabled.

## 13. Additional final checks

- [x] Fresh-data/configuration Docker startup passed using built images; zero initial missions and PC-104 Inactive v1.
- [x] Temporary test project and volumes removed; main history preserved.
- [x] Genuine desktop/tablet/mobile screenshots captured; no page errors or horizontal overflow at 1024px and 390px.
- [x] Fail-closed recovery smoke exits 2 before mutations when live dependencies are unavailable.
- [x] Partial approval, running execution, escalation and pending verification cannot display completed tracker stages.
- [ ] Physical mobile devices or screen-reader session (not tested).
- [ ] Empty-cache installation/public clean-clone build (not established by fresh-data test).
- [x] Organizer overview checked; full rules and exact video requirements remain unconfirmed.
