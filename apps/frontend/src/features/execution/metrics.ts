import type { ExecutionBundle } from "../../types/execution";

export function executionMetrics(bundle: ExecutionBundle) {
  const results = new Map(
    bundle.results.map((result) => [result.action_id, result]),
  );
  const recorded = bundle.manifest.actions.flatMap((action) =>
    results.get(action.id) ? [results.get(action.id)!] : [],
  );
  const durations = recorded
    .map((result) => result.duration_ms)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    );
  const started = bundle.session.started_at
    ? Date.parse(bundle.session.started_at)
    : NaN;
  const ended = Date.parse(
    bundle.session.completed_at || bundle.session.updated_at,
  );
  return {
    results,
    completed: recorded.filter((result) =>
      ["SUCCEEDED", "SATISFIED"].includes(result.status),
    ).length,
    executed: recorded.filter((result) => result.action_executed).length,
    failed: recorded.filter((result) => result.status === "FAILED").length,
    elapsed:
      Number.isFinite(started) && Number.isFinite(ended) && ended >= started
        ? (ended - started) / 1000
        : null,
    averageActionMs: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null,
  };
}
