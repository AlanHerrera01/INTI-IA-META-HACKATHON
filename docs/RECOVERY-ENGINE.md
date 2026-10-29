# Bounded recovery engine

Phase 4 adds DETECT → DIAGNOSE → PLAN → AUTHORIZE → RECOVER → CHECK → RESUME.
`FailureDetectionService` uses structured dispatch/check signals, not screenshot
difference alone. Failure contexts retain original target, action, expected checks,
before/current observation references and safe error code. Fresh observations are
private. The model separates observed facts, hypotheses and uncertainties.

`MetaRecoveryAdapter` sends the two actual stored screenshots and typed original
scope to the existing Muse Spark structured-output adapter, with zero hidden
retries. Official [image support](https://dev.meta.ai/docs/image-understanding),
[structured output](https://dev.meta.ai/docs/structured-output) and
[model identifiers](https://dev.meta.ai/docs/models) were checked. No live recovery
call was executed: the user chose to continue without real calls. Test reasoners
are explicitly named fixtures and are never installed by runtime composition.

The deterministic selector prefers reobservation, refreshed grounding, relocation,
bounded waiting, reviewed modal dismissal, then limited replanning. Human-request
and abort strategies escalate. Confidence never grants permission. Runtime patches
must end with the interrupted action's original parameters, action type and exact
postconditions, preserving its guards except a justified target rebinding. Prefix
steps may inspect, wait or dismiss an explicitly reviewed modal. Other records,
external URLs, prohibited operations and unresolved uncertainty are rejected.

Only an exact equivalent contract can inherit existing authorization. Changed
bindings or new steps require a sealed repair-plan approval and separate HIGH
action confirmation. A changed persistent-save binding also requires the intended
asset heading. Digests bind the original objective, original manifest and new
actions. Completed executions cannot be restarted through recovery APIs.

Default budgets: three attempts, 120 seconds, five model calls, ten recovery
actions, two identical recovery failures, optional aggregate token cap. Counters
commit before spending a call/action; retries cannot extend the original deadline.
Unknown token usage with an explicit token cap stops recovery. Transient model
errors can await an explicit operator retry while the original budget remains.
Missing configuration escalates safely. Ambiguous/unknown destinations fail closed.

If original postconditions are already satisfied, recovery advances without
replaying the action. An uncertain mutation is never blindly repeated. Historical
executed/possibly-executed recovery mutations are blocked from replay. Interrupted
attempts/results are finalized conservatively. Restart marks unfinished recoveries
failed; it never replays browser actions. Execution remains RECOVERING until the
patch is verified, then resumes at the next original action or stops safely.

Browser checks detect ambiguous/disabled controls, stale observations, navigation
mismatch, a changed target frame and modal hit-test obstruction. The internal DOM
geometry/hit-test probes are fixed trusted code, not a user script execution port.
Visual-only repair is explicitly unsupported; recovery never silently changes the
grounding mode. Hybrid and exact-selector paths preserve their original mode.

Six tables persist sessions, failure contexts, strategies, attempts, events and
evidence references in migration 0004. Events project atomically into the existing
execution stream. Recovery Center displays budgets, facts/hypotheses, protected
before/current observations, proposed actions and assertions, approval dialogs,
attempt history and event timeline. RECOVERED establishes immediate action checks;
Phase 5 independently determines persisted task success.
