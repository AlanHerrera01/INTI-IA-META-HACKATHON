import { expect, it } from "vitest";
import {
  recoveredTask,
  taskElapsed,
  taskMatches,
  type TaskRecord,
} from "../src/features/tasks/records";
import type { Mission, MissionDetail } from "../src/types/mission";
const mission = {
  id: "mission-unit-fixture",
  objective: "Update inventory",
  target_application: "inventory",
  mode: "authored_demo",
  status: "PLAN_READY",
  created_at: "2026-10-30T12:00:00Z",
} as Mission;
const detail = {
  execution: {
    session: {
      status: "COMPLETED",
      started_at: "2026-10-30T12:00:00Z",
      completed_at: "2026-10-30T12:00:05Z",
    },
  },
  recoveries: [],
} as unknown as MissionDetail;
const record: TaskRecord = { mission, detail };
it("keeps completed, verified and recovered as separate facts", () => {
  expect(taskMatches(record, "completed", "", "", 0, 0)).toBe(true);
  expect(recoveredTask(detail)).toBe(false);
  expect(taskMatches(record, "recovered", "", "", 0, 0)).toBe(false);
  expect(taskMatches({ mission }, "completed", "", "", 0, 0)).toBe(false);
  expect(
    taskMatches(
      {
        mission,
        detail: {
          ...detail,
          execution: {
            ...detail.execution!,
            session: { ...detail.execution!.session, status: "PAUSED" },
          },
        },
      },
      "running",
      "",
      "",
      0,
      0,
    ),
  ).toBe(false);
  expect(
    recoveredTask({
      ...detail,
      recoveries: [{ session: { status: "FAILED" } }],
    } as MissionDetail),
  ).toBe(false);
});
it("applies precise time, search and preparation filters only to supplied records", () => {
  const now = Date.parse("2026-10-31T11:00:00Z");
  expect(taskMatches(record, "all", "inventory", "PLAN_READY", 24, now)).toBe(
    true,
  );
  expect(taskMatches(record, "all", "inventory", "FAILED", 24, now)).toBe(
    false,
  );
  expect(taskMatches(record, "all", "", "", 24, now + 7200000)).toBe(false);
  expect(
    taskMatches(record, "all", "", "", 24, Date.parse("2026-10-29T12:00:00Z")),
  ).toBe(false);
});
it("reports only finite nonnegative recorded execution durations", () => {
  expect(taskElapsed(detail)).toBe(5);
  expect(taskElapsed()).toBeNull();
  expect(
    taskElapsed({
      ...detail,
      execution: {
        ...detail.execution!,
        session: {
          ...detail.execution!.session,
          completed_at: "2026-10-29T12:00:00Z",
        },
      },
    }),
  ).toBeNull();
});
