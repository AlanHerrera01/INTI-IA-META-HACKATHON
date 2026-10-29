# Phase 3 implementation report

INTI AI · Intelligent Navigation, Task Execution & Interaction · Ecuador

See. Reason. Act. Verify. · Meta Global AI Developer Hackathon 2026 · Push the Frontier

Version 0.3.0. Verification performed October 28, 2026 America/Bogota
(the recorded execution timestamps are October 29 UTC).

## 1. Executive summary

**IMPLEMENTED AND VERIFIED:** authorized typed browser execution against the local
inventory sandbox, persistent isolated sessions, fresh before/after evidence,
transactional results/events, exact-manifest approvals, separate HIGH confirmation,
pause/resume/cancel and a live execution workspace.

The real Docker demonstration executed nine approved actions and nine immediate
checks. PC-104 changed from Inactive to Operational in the demo's SQLite store;
an independent application API read and a new Chromium page confirmed persistence.
This demonstration uses an explicitly authored plan, not fabricated Meta output.
The engine retains `overall_goal_verified=false`; independent verification belongs
to the test harness rather than a general autonomous goal verifier.

**BLOCKED:** real Meta-derived planning/visual execution, because no Meta credential
with verified model access is configured. **NOT IMPLEMENTED:** autonomous replanning,
self-healing recovery and a general final-goal verifier, reserved for Phase 4.

## 2. Repository audit

The repository was clean at `20a6edd`. README, SDD, architecture, Phase 1/2 reports,
domain contracts, planning policy/use cases, shared Meta transport, Playwright
observation adapter, frontend planning workspace and Alembic history were inspected.

Before Phase 3, backend checks passed 91 tests with five opt-in E2E tests excluded;
domain/application statement coverage was 99.08%. Frontend baseline was ten passing
tests and a successful production build. The Compose observation/planning stack
was healthy. Observation, artifacts, configuration diagnostics, typed planning,
policy validation and planning persistence worked. No broken dependency required
replacing the established stack. A live paid Meta result remained unverified.

Missing interfaces were persistent browser sessions, typed dispatch, execution
authorization, orchestration, execution repository/events and execution UI. The
demo saved only browser session state and lacked PC-104. Security gaps for this
new scope required private execution evidence, capability authentication, request
restrictions on every browser request and worker isolation from model/database secrets.

Migration 0003 adds execution history and private-observation classification.
Legacy observation and planning contracts remain available. Historical migration
tests now seed the historical schema directly rather than using a newer ORM against
the old schema. No production/user data was reset or deleted.

## 3. Implemented components

| Deliverable | Classification | Evidence |
|---|---|---|
| Execution entities, state rules and deterministic policy | IMPLEMENTED AND VERIFIED | State-pair, freshness, binding, digest and validation tests |
| Exact plan and HIGH approvals | IMPLEMENTED AND VERIFIED | Protected API tests; missing/wrong approvals rejected |
| Browser lifecycle and hybrid target resolution | IMPLEMENTED AND VERIFIED | Real Chromium tests and Docker demonstration |
| Typed click/type/select/scroll/navigate/wait/inspect/verify | IMPLEMENTED AND VERIFIED | Real action tests; nine-action workflow |
| Pause/resume/cancel and duplicate-start protection | IMPLEMENTED AND VERIFIED | Live API/engine tests and Docker pause/resume |
| Timeouts, critical failure and restart handling | IMPLEMENTED AND VERIFIED | Fault-injection tests; no replay |
| Transactional PostgreSQL execution history and events | IMPLEMENTED AND VERIFIED | Running Docker workflow; SQLite integration/CAS tests |
| Protected PNG evidence | IMPLEMENTED AND VERIFIED | Before/after artifacts; anonymous PNG request denied |
| REST/WebSocket replay and responsive workspace | IMPLEMENTED AND VERIFIED | API/component tests and desktop/mobile browser checks |
| Selector-based resolution | IMPLEMENTED BUT NOT VERIFIED | Explicit data-testid intersection implemented; no separate selector benchmark |
| Fresh model coordinate mode | IMPLEMENTED BUT NOT VERIFIED | Digest/session-bound coordinate path present; no real model execution |
| Live Meta-derived end-to-end execution | BLOCKED | Model credentials/access unavailable |
| Visual-only select-option and DOM assertions | NOT IMPLEMENTED | Explicitly rejected rather than silently switching modes |
| Autonomous recovery/replanning and general goal verification | NOT IMPLEMENTED | Outside this phase |

## 4. Files created or modified

New backend files:

- `domain/execution.py`, `execution_policy.py`, `execution_ports.py`.
- `application/execution.py`, `sandbox_recipe.py`.
- `infrastructure/browser/controller.py`, `remote.py`.
- `infrastructure/persistence/execution.py`.
- `presentation/execution_api.py`, `execution_auth.py`, `inti/worker.py`.
- `migrations/versions/0003_execution.py`.
- `tests/integration/test_execution.py`, `tests/unit/test_execution_policy.py`.

Backend updates: composition root, app lifecycle/CORS/error codes, config and
package version, observation privacy/storage queries, migration imports and
historical migration/API tests. Existing planning/model adapters were preserved.

New frontend files: `pages/ExecutionPage.tsx`, `services/executionApi.ts`,
`types/execution.ts`, `styles/execution.css`, `tests/execution.test.tsx`.
Navigation, WebSocket proxy and package/lockfile versions were updated.

Demo updates: persistent `server.py`, `src/inventory.js`, record dialog/table and
container entry point. Infrastructure updates: Compose worker/network/volumes,
settings example, ignored temporary test files and Chromium installation in CI.
Verification: `scripts/verify_execution.py`,
[`evidence/phase3-execution.json`](evidence/phase3-execution.json).
README, SDD, architecture, API and development documentation were updated; this
report was added. Local PNG artifacts remain ignored and were not published.

## 5. Architecture decisions

Domain stays framework-free. Application orchestration depends on structural
ports. Infrastructure implements SQLAlchemy persistence, a private HTTP worker,
Playwright control and bounded PNG storage. Presentation supplies protected
REST/WebSocket routes and configuration. Existing Meta transport remains intact.

The frozen manifest hashes the plan snapshot, action identities/parameters,
typed checks, targets, URL, viewport, mode and budgets. Canonical numeric encoding
preserves hashes through Pydantic/database JSON round trips. The original plan is
checked again before start/resume and each action. Authorization cannot come from
a model recommendation. Capability identities come from server configuration.

Conditional Phase 2 plans may proceed only when clarification is exclusively a
known runtime observation/grounding gate and exact typed contracts are approved.
Business/scene ambiguity, unverified business inferences, rejected plans and
expired evidence remain blocking. Future controls are freshly observed and
resolved at execution time, never assumed visible in the initial screenshot.

One backend process owns asyncio tasks. CAS versions prevent stale writes; state,
results, decisions and events commit together. Screenshots are separate filesystem
artifacts, with compensation after failed metadata writes. A crash may leave an
orphan PNG; this is not a distributed transaction or durable job queue.

## 6. Execution state machine

CREATED → AWAITING_APPROVAL → READY → RUNNING. RUNNING can pause, complete, fail,
cancel or time out. PAUSED can resume, cancel, fail on lost state, or time out.
CREATED/AWAITING_APPROVAL/READY may cancel; READY may fail during abandoned-start
handling. All terminal transitions are rejected. Every allowed/forbidden pair
is tested. Duplicate RUNNING starts return DUPLICATE_START.

Pause completes the current observation/action cycle before scheduling another.
Resume checks approval, freshness, session existence, URL and viewport; the next
cycle resolves its target against fresh evidence. Total execution budget includes
pause time. Restart marks abandoned RUNNING/PAUSED sessions FAILED/PROCESS_RESTART;
no action is replayed. Cancellation does not reverse already committed app changes.

## 7. Browser integration

Persistent contexts retain state across actions and close after terminal outcomes.
Before dispatch, the worker validates session URL/viewport, session-bound fresh
evidence, authorization, unique visible/enabled targets and approved typed checks.
Hybrid resolution uses exact accessible names/roles. Approved selectors intersect
data-testid with semantic targets; no arbitrary CSS/script execution is exposed.

Immediate postchecks briefly observe pending asynchronous app effects within the
action timeout; they do not repeat dispatch. This fixed an initially detected
race where Save had committed but the receipt had not yet appeared. The engine
correctly reported POSTCONDITION_FAILED before this observation timing was fixed.

Resolution metadata, executed state, immediate checks and uncertain interruption
effects are recorded separately. No coordinate fallback, recovery or automatic
non-idempotent retry exists. The demo stores actual SQLite writes with optimistic
row versions, returns committed records, and survives browser/container reloads.

## 8. Security implementation

Operator REST capability and separate private-worker capability are constant-time
compared; execution defaults disabled. HIGH Save requires a second exact-action
approval. All decision records contain digest, operator, timestamp and reason.
Known rejected approval/start attempts emit safe authorization_rejected events.
Missing operator credentials cannot create, inspect, approve or control executions.

Private execution screenshots require authenticated fetches; the React viewer uses
revoked temporary blob URLs. Public observation lists exclude execution evidence.
WebSocket credentials travel in the first frame, not URLs; allowed Origin is checked.
Logs/events/responses contain safe IDs/codes, not credentials or raw exceptions.

Every browser HTTP request is restricted to the exact demo origin and approved
methods; main-frame navigation additionally requires an exact URL/budget. Redirect
responses are not followed. Frames, popups, external resources, downloads and
WebSockets are blocked. A dedicated test removes application CSP and confirms no
request reaches a separate unauthorized local trap server, including redirects.

Compose worker: internal network only, no published host port, no Meta/DB environment
credentials or host mounts, non-root user, read-only root, tmpfs, dropped capabilities,
no-new-privileges, 768 MiB memory, 256 PIDs and 256 MiB shared memory. Chromium receives
an environment whitelist. This boundary serves a trusted local synthetic sandbox;
public internet browsing and hostile multi-tenant workloads are unsupported.

## 9. API endpoints and events

Implemented all ten required REST routes: POST executions/create, approve, start,
pause, resume and cancel; GET execution, actions, events and paginated history.
An extra protected demo/prepare route creates the explicitly authored demonstration.
Exact schemas, examples, safe errors and grounding restrictions are in [API](API.md).

`/ws/executions/{id}` replays persisted events by monotonic sequence, then streams
new events. Reconnect uses `after`; client UUID deduplication prevents duplicate
timeline handling. REST polling continues when sockets are unavailable. All
required lifecycle/action/observation events are persisted. TIMED_OUT emits
execution_failed with an explicit timeout code and terminal status.

## 10. Frontend functionality

Live Execution adds operator connection, authored-demo preparation, advanced
validated-plan/typed-contract loading, exact-manifest confirmation dialogs and
separate HIGH review. State-aware controls expose start, pause, resume and cancel.
Dashboard, progress, action timings/errors, execution inspector, model provenance,
protected evidence preview, URL/viewport/timestamp and paginated history use real
backend data. The viewer highlights a target only when resolution belongs to the
displayed observation. Error boundary, loading/error states and event replay are
implemented. Desktop 1440px and mobile 390px screenshots were visually inspected.

The in-app browser connector failed bootstrap with missing sandboxPolicy. Project
Playwright verification was used successfully instead; no in-app verification is claimed.

## 11. Tests executed

| Check | Actual result |
|---|---|
| Backend full non-E2E suite | 127 passed, 5 opt-in tests deselected |
| Domain/application coverage | 94.57%, 1124 statements, 61 misses; required minimum 80% |
| Additional all-request firewall test | 1 passed, 19 execution tests deselected |
| Frontend component tests | 16 passed |
| Ruff lint/format | Passed |
| MyPy strict | Passed, 39 source files |
| Frontend ESLint, TypeScript and Vite production build | Passed |
| Synthetic Phase 2 policy regression | 12 scenarios, 100% expected outcome agreement; not model/execution success |
| Docker build and actual workflow | Passed; Chromium RPC, PostgreSQL and SQLite used |
| Live Phase 1/2 E2E regression after final rebuild | 4 passed, 1 skipped (paid Meta opt-in) |

Tests cover all state pairs, invalid action contracts, missing/changed approvals,
freshness, target uniqueness/disabled/missing controls, actual click/type/select,
page wait/scroll/navigation, evidence privacy, results/events/CAS, protected REST,
WebSocket replay, worker capability/limits, duplicate start, pause/resume/cancel,
timeouts, uncertain failures, lost sessions and process restart. No ordinary CI
test makes a paid Meta call. Local Python was 3.14; Docker/CI target Python 3.12.
The local Starlette TestClient emitted a dependency deprecation warning; tests passed.
An initial live regression overlapped container recreation and hit connection
refusals; it was repeated after all services reported healthy and passed. Final
0.3.0 workspace/evidence and saved Operational state were rechecked without writes.

GitHub Actions installs Chromium with Linux dependencies and runs backend/frontend
lint, typing, tests, coverage, policy benchmark and production build. The hosted
run for implementation commit `627570b` completed successfully for both backend
and frontend: [run 40812399954](https://github.com/AlanHerrera01/INTI-IA-META-HACKATHON/actions/runs/40812399954).
This also runs the added firewall test together with the complete Linux suite.

## 12. Actual execution results

Source: [`evidence/phase3-execution.json`](evidence/phase3-execution.json), generated
by `scripts/verify_execution.py --run-sandbox` against the real Compose stack.
The opt-in harness submitted the exact authored plan and separate HIGH approval
using the configured local operator capability. This is test-operator authorization,
not a claim that an interactive human clicked the confirmation dialogs.

| Metric | Measured value |
|---|---:|
| Planned / executed / successful actions | 9 / 9 / 9 |
| Failed actions / target failures / browser failures | 0 / 0 / 0 |
| Authorization rejections in this completed run | 0; rejected paths tested separately |
| Immediate postcondition pass rate | 100% |
| Execution duration, including pause | 6.001199 s |
| Persisted execution events | 47 |
| Before/after evidence pairs | 9 |
| Cancellation request response | 74.9871 ms |
| Model calls | 0, explicitly authored workflow |

Execution ID: `4e0b42de-88df-4b19-8fa1-04ef2ef57d43`.
Plan ID: `97c33699-ba54-42bd-a72e-2aae291d322e`.
Grounding mode: hybrid_dom. Final status: COMPLETED. Demo store: PC-104,
Operational, row version 2. Independent API read and new-browser reload passed.
The final receipt was visible in a protected screenshot. Engine goal verification
remained false. These measurements describe one deterministic sandbox run and
are not statistical reliability or visual-reasoning benchmarks.

Cancellation timing above covers an unstarted AWAITING_APPROVAL execution; live
RUNNING cancellation and resource release were separately verified by automated
engine/API tests. Docker pause/resume was exercised in the completed run. Local
desktop/mobile UI captures and full metrics are under ignored `artifacts/phase3/`.
The inventory change was preserved after container rebuilds.

## 13. Known limitations

- Real Meta planning and pure visual execution lack live verification/credentials.
- Visual-only option selection and DOM assertions fail explicitly as unsupported.
- The advanced plan loader requires operator-authored typed contracts; natural
  language preconditions are not automatically interpreted as executable checks.
- One backend scheduler process; no distributed lease, durable queue or crash replay.
- Fixed, trusted local demo origins; no remote login, general browsing or account system.
- No automatic rollback of app commits; interrupted effects can remain uncertain.
- Immediate checks are bounded assertions, not a general final-goal verifier.
- Container caps apply to the worker as a whole; no per-tab memory accounting.
- A process crash between artifact and metadata writes may leave an orphan PNG.
- The initial recipe expects Inactive. Repeating it after a successful save fails
  safely; existing demo data is never silently reset to make a benchmark pass.

## 14. Phase 4 prerequisites

Verify real Meta model access and evaluate localization against labeled screenshots.
Add an independent reusable final-goal verifier and explicit failure taxonomy.
Design bounded recovery plans with fresh observations and scoped reapproval after
material changes. Preserve uncertain-action semantics and prevent duplicate writes.
Evaluate prompt injection, adversarial UI changes and authorization boundaries.
Add stronger process isolation/leases if multi-process scheduling becomes necessary,
artifact reconciliation/retention and sustained reliability/load benchmarks. Retain
the current fail-closed behavior until those capabilities are independently tested.
