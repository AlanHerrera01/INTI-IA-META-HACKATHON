import type { Mission, MissionDetail } from "../../types/mission";

export interface TaskRecord {
  mission: Mission;
  detail?: MissionDetail;
  error?: string;
}
export function recoveredTask(detail?: MissionDetail) {
  return !!detail?.recoveries?.some(
    (recovery) => recovery.session.status === "RECOVERED",
  );
}
export function taskMatches(
  record: TaskRecord,
  tab: string,
  search: string,
  preparation: string,
  hours: number,
  now: number,
) {
  const { mission, detail } = record;
  const state = detail?.execution?.session.status;
  const tabMatch =
    tab === "all" ||
    (tab === "running" && state === "RUNNING") ||
    (tab === "completed" && state === "COMPLETED") ||
    (tab === "recovered" && recoveredTask(detail));
  const created = Date.parse(mission.created_at);
  const timeMatch =
    hours === 0 ||
    (Number.isFinite(created) &&
      created >= now - hours * 3600000 &&
      created <= now);
  return (
    tabMatch &&
    timeMatch &&
    (!preparation || mission.status === preparation) &&
    `${mission.id} ${mission.objective} ${mission.target_application} ${mission.mode}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );
}
export function taskElapsed(detail?: MissionDetail): number | null {
  const session = detail?.execution?.session;
  if (!session?.started_at) return null;
  const start = Date.parse(session.started_at),
    end = Date.parse(session.completed_at || session.updated_at);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? (end - start) / 1000
    : null;
}
export function downloadTaskJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
