# INTI AI — Phase 7 implementation report

Release 0.7.0 · Reviewed 2026-10-30 · Local single-operator Windows/Docker environment.

## 1. Executive summary

**IMPLEMENTED AND VERIFIED:** Mission Control, stable mission identity, explicit
authorization, real browser execution, independent verification, restricted reset,
honest Benchmark Lab and reproducible startup. The authored demo completed nine
real actions and verified persistence with eight intact evidence items.

**Full live-model acceptance remains BLOCKED.** The user requested no real model
calls. The authored recipe is explicitly labeled and does not establish model
planning or live-model recovery. No video publication or submission is claimed.

## 2. Repository audit findings

Phases 1–5 provide observation, typed planning, approved execution, bounded recovery
and independent verification. Their routes and architecture were preserved.
Phase 6 comparative evaluation is **NOT IMPLEMENTED**; migration `0006_missions`
does not constitute that phase. The deployed backend was rebuilt from 0.5.0 to
0.7.0. User-provided design exports remain outside the release commit.

## 3. Implemented features

- Mission create/prepare/detail/execution APIs with one task/mission UUID.
- Explicit authored and Meta modes; unavailable Meta access fails visibly.
- Backend-derived tracker, activity, capabilities and integrity-aware latest verdict.
- Exact-manifest approval plus separate HIGH-risk action approval.
- Synthetic reset with confirmation, store identity and active-work guards.
- Restricted rename/relocate fault control isolated from agent capabilities.
- Allowlisted benchmark reports with computed SHA-256 and validated metric shapes.
- Startup, fail-closed smoke, clean-data startup and genuine screenshot scripts.

## 4. Files created or modified

Implementation commit: `a4c85d6146390b4e61e84fa8b2305d788e58a2a9`.
Use `git show --stat a4c85d6` for the complete implementation manifest.

| Area | Principal files |
|---|---|
| Backend domain/application | `domain/missions.py`, `domain/inventory_objective.py`, `application/missions.py`, planning/execution integration |
| Backend infrastructure/API | `infrastructure/demo_control.py`, `infrastructure/persistence/missions.py`, `presentation/mission_api.py`, `presentation/benchmark_api.py`, migration `0006_missions.py` |
| Frontend | `app/OperatorContext.tsx`, `hooks/useOperator.ts`, Mission Control/Benchmark pages, mission API clients, MissionTrail, RatioMetric, shared styles |
| Tests | Mission integration, fail-closed smoke unit tests, frontend mission workflow tests |
| Operations | Compose, `.env.example`, `start_demo.ps1`, `live_demo_check.py`, `verify_clean_start.ps1`, `capture_demo_screenshots.py` |
| Documentation | README, architecture, submission, script, storyboard, judge guide, QA checklist, this report, JSON evidence and seven screenshots |

Backend paths are relative to `apps/backend/src/inti`, frontend paths to
`apps/frontend/src`, operational scripts to `scripts`.

## 5. Integration status

**IMPLEMENTED AND VERIFIED:** observation → authored plan → explicit approvals →
browser execution → independent verification → evidence. Preparing a plan grants no
authorization. Mission identity persists across workspaces.

**IMPLEMENTED BUT NOT VERIFIED with live Meta:** planning and recovery adapters.
Meta execution preparation requires reviewed typed action contracts; arbitrary
natural-language checks are not silently interpreted. Disabled access produces
`MODEL_CALLS_DISABLED`, never a fallback plan.

## 6. Frontend improvements

Mission Control is the default workspace. Shared in-memory authorization, mission
links, navigation, design tokens, visible focus, skip link, reduced-motion support
and responsive layouts unify the product. Regression tests prevent partial approvals,
running executions, pending verification or recovery escalation from appearing done.
Latest verdicts validate evidence integrity instead of trusting historical success.

Seven screenshots show actual pages. Tablet (1024×900) and mobile (390×844) checks
found no horizontal overflow or page errors. Desktop/mobile captures were visually
reviewed. Physical devices and screen readers were not tested.

## 7. Demo scenario results

`INTI-DEMO-001`, recorded 2026-10-30T13:26:26Z:

- Explicit synthetic reset established PC-104 `Inactive`.
- Authored nine-step plan received exact plan and separate HIGH-risk approvals.
- Nine real browser actions succeeded; execution `COMPLETED`.
- Independent verdict `VERIFIED_SUCCESS`; persisted PC-104 `Operational`.
- Eight evidence items passed integrity checks; zero model calls.

See [live evidence](evidence/phase7-live-demo.json). The stack remains running with
the completed result and preserved history. Startup never implicitly resets it.

## 8. Recovery results

**IMPLEMENTED AND VERIFIED mechanically:** the integration test injects an actual
renamed/relocated Save control, exercises bounded recovery and reauthorization,
repairs through the real browser and independently verifies persistence. Only the
diagnosis reasoner is an explicitly labeled fixture.

**BLOCKED for live Meta:** the smoke command with `--arm-fault` exits 2 with `BLOCKED`
before reset or execution when dependencies are missing. A requested fault trial
cannot pass without injection and recovery. See [blocked evidence](evidence/phase7-live-recovery-blocked.json).
No live-model recovery or recovery success rate is claimed.

## 9. Verification results

Versioned criteria and a pre-execution baseline are evaluated against fresh independent
persisted-state reads and a separate browser. Verdicts are `VERIFIED_SUCCESS`,
`VERIFIED_FAILURE` or `INCONCLUSIVE`; execution completion is not outcome proof.

An integration test corrupts a stored artifact and confirms the overview becomes
`INCONCLUSIVE` while retaining the historical verdict; it restores original bytes.
The executor's `declared_overall_goal_verified=false` remains distinct from the
independent verdict. Eight live-run evidence items were intact.

## 10. Benchmark data availability

The Lab reads committed Phase 5 verification and Phase 2 policy reports. Five local
verification fault trials measured verdict agreement 5/5, verified success 1/5,
false-positive detection 3/3, inconclusive 1/5 and criteria agreement 25/25.
This fault mix is not a comparative agent or Meta reliability estimate. Policy
fixtures are separately labeled. SHA-256 is computed identification, not external
attestation. Phase 6 comparison, recovery rate, execution latency benchmark and
global unsafe-action counts are **NOT IMPLEMENTED** and remain unavailable.

## 11. Security audit findings

Operator, worker, verifier and demo-admin capabilities are distinct and private.
The worker has no host port or Meta/database/admin credential; verification uses
a read-only plane. Published ports bind to loopback. Tokens stay in browser memory;
`.env` is ignored. Reset requires a marked synthetic store, current UUID, literal
confirmation and no active execution/verification; it preserves other records and
historical evidence. Benchmark paths and sizes are restricted.

Release files were compared against configured private token values before staging.
TLS verification was never disabled; intercepted builds use an explicit trusted CA.
This is a trusted local operator model. Durable distributed jobs and multi-tenant
isolation are not implemented; restart can interrupt in-process work.

## 12. Tests executed and actual outcomes

| Check | Actual outcome |
|---|---|
| Backend excluding opt-in E2E | 223 passed, 5 deselected; 89.66% domain/application coverage |
| Real browser/API/PostgreSQL E2E | 4 passed, 1 live-model test skipped, 223 deselected |
| Frontend Vitest | 33 passed in 6 files |
| Frontend typecheck, lint, production build | Passed |
| Strict MyPy | 63 source files passed |
| Ruff source/tests/scripts and formatting | Passed; 108 files formatted |
| Authored real demo | Passed; 9 actions, 8 intact evidence items |
| Requested live recovery without dependencies | Correctly BLOCKED; exit 2, no mutation |
| Fresh Docker data/configuration startup | Passed; zero missions, PC-104 Inactive v1, real verified run |
| Actual UI capture | Seven PNGs, no page errors, two responsive sizes without overflow |

One upstream Starlette test-client deprecation warning remains. Live-model tests
were deliberately disabled. Public CI status is recorded in
[validation evidence](evidence/phase7-validation.json).

## 13. Deployment readiness

**IMPLEMENTED AND VERIFIED for the local demo:** `scripts/start_demo.ps1` builds,
starts and waits for six healthy 0.7.0 services without resetting history.
`verify_clean_start.ps1` tested a release-file export with fresh random capabilities,
new volumes and existing built images. Initial history was empty and PC-104 Inactive
v1; an actual run verified success. Its unique temporary project/volumes were removed
without touching main-project data. See [clean-start evidence](evidence/phase7-clean-start.json).

This does not establish an empty-cache dependency installation or public clean-clone
build. No production deployment is claimed. Workspace: <http://localhost:5173>.

## 14. Submission materials produced

- [Submission copy and status](SUBMISSION.md)
- [Approximately three-minute English video script](DEMO-VIDEO-SCRIPT.md)
- [Storyboard](DEMO-STORYBOARD.md)
- [Judge guide](JUDGE-DEMO-GUIDE.md)
- [QA checklist](QA-CHECKLIST.md)
- [Final architecture and API map](FINAL-ARCHITECTURE.md)
- Genuine screenshots and machine-readable evidence.

Public repository: <https://github.com/AlanHerrera01/INTI-IA-META-HACKATHON>.
The organizer overview was checked on 2026-10-30; full rules, eligibility and exact
video requirements remain unconfirmed as explained in the submission document.

## 15. Remaining blockers

| Classification | Remaining item |
|---|---|
| BLOCKED | Live Meta planning/recovery acceptance: real calls disabled per user instruction |
| NOT IMPLEMENTED | Phase 6 comparative evaluation and unmeasured recovery/latency/safety metrics |
| NOT IMPLEMENTED | Recorded/published video and actual hackathon form submission |
| IMPLEMENTED BUT NOT VERIFIED | Live-model adapters under real access; physical-device/screen-reader experience |
| BLOCKED | Complete organizer rules, eligibility and final submission requirements |

The authored workflow and fixture-diagnosed real recovery test are complete. They
do not establish the requested full live-model autonomous demo.
