import { expect, it } from "vitest";
import {
  activityCsv,
  filterActivity,
  recentActivity,
} from "../src/features/activity/records";
import type { MissionActivity } from "../src/types/mission";
const event: MissionActivity = {
  id: "fixture-event",
  source: "execution",
  event_type: "action_started",
  timestamp: "2026-11-01T12:00:00Z",
};
it("deduplicates only matching source and event identity and selects explicit metadata", () => {
  const data = recentActivity([
    { ...event, private_capability: "fixture-private" } as MissionActivity,
    event,
    { ...event, source: "planning" },
  ]);
  expect(data).toHaveLength(2);
  expect(data[0]).toEqual(event);
  expect(JSON.stringify(data)).not.toContain("fixture-private");
});
it("applies time limits only to the loaded window and excludes invalid or future dates", () => {
  const rows = [
    event,
    { ...event, id: "future", timestamp: "2026-11-03T00:00:00Z" },
    { ...event, id: "invalid", timestamp: "invalid-date" },
  ];
  expect(
    filterActivity(
      rows,
      { source: "", type: "", search: "action started", period: "24h" },
      Date.parse("2026-11-01T14:00:00Z"),
    ),
  ).toEqual([event]);
  expect(
    filterActivity(rows, { source: "", type: "", search: "", period: "all" }),
  ).toHaveLength(3);
});
it("quotes CSV values and neutralizes spreadsheet formula fields", () => {
  const csv = activityCsv([{ ...event, event_type: '=HYPERLINK("fixture")' }]);
  expect(csv).toContain('"\'=HYPERLINK(""fixture"")"');
  expect(csv).not.toContain("private_capability");
  expect(csv.startsWith("id,source,event_type,timestamp\r\n")).toBe(true);
});
