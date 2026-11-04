import type { ExecutionBundle } from "../../types/execution";

export function executionSeconds(execution: ExecutionBundle): number | null {
  const { started_at, completed_at } = execution.session;
  if (!started_at || !completed_at) return null;
  const seconds = (Date.parse(completed_at) - Date.parse(started_at)) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function summarizeExecutions(executions: ExecutionBundle[]) {
  const completed = executions.filter(
    (execution) => execution.session.status === "COMPLETED",
  );
  const durations = completed
    .map(executionSeconds)
    .filter((value): value is number => value !== null);
  return {
    completed: completed.length,
    loaded: executions.length,
    durations,
    meanSeconds: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null,
  };
}

export function durationLabel(seconds: number | null) {
  return seconds === null ? "—" : `${seconds.toFixed(2)}s`;
}
