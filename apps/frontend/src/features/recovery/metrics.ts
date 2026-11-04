import type { RecoveryBundle } from "../../types/recovery";

export const recoveryStopped = new Set([
  "RECOVERED",
  "FAILED",
  "CANCELLED",
  "ESCALATED",
]);
export function recoveryMetrics(items: RecoveryBundle[]) {
  const recovered = items.filter(
    (item) => item.session.status === "RECOVERED",
  ).length;
  const failed = items.filter(
    (item) => item.session.status === "FAILED",
  ).length;
  const durations = items.flatMap((item) => {
    if (!item.session.completed_at) return [];
    const elapsed =
      Date.parse(item.session.completed_at) -
      Date.parse(item.session.started_at);
    return Number.isFinite(elapsed) && elapsed >= 0 ? [elapsed] : [];
  });
  return {
    recovered,
    resolved: recovered + failed,
    rate: recovered + failed ? (recovered / (recovered + failed)) * 100 : null,
    meanMs: durations.length
      ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length
      : null,
    durationSamples: durations.length,
    escalated: items.filter((item) => item.session.status === "ESCALATED")
      .length,
  };
}
