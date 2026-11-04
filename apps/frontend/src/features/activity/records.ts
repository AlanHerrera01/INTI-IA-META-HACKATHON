import type { MissionActivity } from "../../types/mission";

export const activitySources = [
  { id: "planning", label: "Planning", path: "/planning" },
  { id: "execution", label: "Execution", path: "/execution" },
  { id: "recovery", label: "Recovery", path: "/recovery" },
  { id: "verification", label: "Verification", path: "/verification" },
] as const;
export const activityKey = (event: MissionActivity) =>
  `${event.source}:${event.id}`;
export const eventMetadata = (event: MissionActivity): MissionActivity => ({
  id: event.id,
  source: event.source,
  event_type: event.event_type,
  timestamp: event.timestamp,
});
export function recentActivity(events: MissionActivity[]) {
  const seen = new Set<string>();
  return events
    .filter((event) => {
      const key = activityKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(eventMetadata);
}
export interface ActivityFilters {
  search: string;
  source: string;
  type: string;
  period: "all" | "24h" | "7d";
}
export function filterActivity(
  events: MissionActivity[],
  filters: ActivityFilters,
  now = Date.now(),
) {
  const search = filters.search.trim().toLowerCase();
  const duration =
    filters.period === "24h"
      ? 86400000
      : filters.period === "7d"
        ? 604800000
        : null;
  return events.filter((event) => {
    const elapsed = now - Date.parse(event.timestamp);
    return (
      (!filters.source || event.source === filters.source) &&
      (!filters.type || event.event_type === filters.type) &&
      (!search ||
        `${event.id} ${event.source} ${event.event_type} ${event.event_type.replaceAll("_", " ")}`
          .toLowerCase()
          .includes(search)) &&
      (duration === null ||
        (Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= duration))
    );
  });
}
export function activityCsv(events: MissionActivity[]) {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+\-@]|^[\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    [
      "id,source,event_type,timestamp",
      ...events.map((event) =>
        [event.id, event.source, event.event_type, event.timestamp]
          .map(cell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
