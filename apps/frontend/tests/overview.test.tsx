import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Overview } from "../src/pages/Overview";
import { OperatorContext } from "../src/hooks/useOperator";
import { missionApi } from "../src/services/missionApi";
import { recoveryApi } from "../src/services/recoveryApi";
import { verificationApi } from "../src/services/verificationApi";
import {
  executionSeconds,
  summarizeExecutions,
} from "../src/features/overview/metrics";
import type { ExecutionBundle } from "../src/types/execution";
import type { MissionOverview } from "../src/types/mission";
import type { VerificationReport } from "../src/types/verification";

vi.mock("../src/services/missionApi", () => ({
  missionApi: { overview: vi.fn() },
}));
vi.mock("../src/services/recoveryApi", () => ({
  recoveryApi: { list: vi.fn() },
}));
vi.mock("../src/services/verificationApi", () => ({
  verificationApi: { report: vi.fn() },
}));
vi.mock("../src/hooks/useSystem", () => ({
  useSystem: () => ({
    data: { backend: true, browser: true, database: true, version: "0.7.0" },
  }),
  useModel: () => ({
    data: { configured: false, available: null, model: "test-model" },
  }),
}));
function execution(status: string, start: string | null, end: string | null) {
  return {
    session: {
      id: "execution-1",
      task_id: "task-1",
      status,
      started_at: start,
      completed_at: end,
      latest_observation_id: null,
    },
    manifest: {
      plan_snapshot: {
        model_usage: [],
        plan: { goal: "Test inventory objective" },
      },
      actions: [],
      initial_url: "http://demo:8001",
    },
    results: [],
  } as unknown as ExecutionBundle;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recoveryApi.list).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(missionApi.overview).mockResolvedValue({
    mission_count: 1,
    executions: [],
    recent_verifications: [],
    features: { recovery_enabled: true, verification_enabled: true },
  } as unknown as MissionOverview);
});
function mount(token = "") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OperatorContext.Provider
        value={{ token, setToken: vi.fn(), notice: "", notify: vi.fn() }}
      >
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      </OperatorContext.Provider>
    </QueryClientProvider>,
  );
}
it("does not fetch private records or invent metrics before connecting", () => {
  mount();
  expect(missionApi.overview).not.toHaveBeenCalled();
  expect(recoveryApi.list).not.toHaveBeenCalled();
  expect(screen.getByRole("region", { name: "Total tasks" })).toHaveTextContent(
    "—",
  );
  expect(
    screen.getByRole("region", { name: "Recovery success rate" }),
  ).toHaveTextContent("No recovery-rate benchmark available");
  expect(screen.getByRole("link", { name: "Create New Task" })).toHaveAttribute(
    "href",
    "/missions/new?compose=1",
  );
});
it("computes average durations only from completed runs with valid timestamps", () => {
  const start = "2026-10-30T12:00:00Z";
  const sample = [
    execution("COMPLETED", start, "2026-10-30T12:00:02Z"),
    execution("COMPLETED", start, "2026-10-30T12:00:04Z"),
    execution("FAILED", start, "2026-10-30T12:01:00Z"),
    execution("RUNNING", start, null),
    execution("COMPLETED", "invalid", "invalid"),
  ];
  expect(summarizeExecutions(sample)).toEqual({
    completed: 3,
    loaded: 5,
    durations: [2, 4],
    meanSeconds: 3,
  });
});
it("rejects invalid or reversed durations instead of displaying misleading times", () => {
  expect(
    executionSeconds(
      execution("COMPLETED", "2026-10-30T12:01:00Z", "2026-10-30T12:00:00Z"),
    ),
  ).toBeNull();
  expect(summarizeExecutions([]).meanSeconds).toBeNull();
});
it("keeps a completed execution inconclusive when independent evidence cannot establish success", async () => {
  const run = execution(
    "COMPLETED",
    "2026-10-30T12:00:00Z",
    "2026-10-30T12:00:03Z",
  );
  vi.mocked(missionApi.overview).mockResolvedValue({
    mission_count: 1,
    executions: [run],
    recent_verifications: [
      { session: { id: "report-1", execution_id: run.session.id } },
    ],
    features: { recovery_enabled: true, verification_enabled: true },
  } as unknown as MissionOverview);
  vi.mocked(verificationApi.report).mockResolvedValue({
    effective_verdict: "INCONCLUSIVE",
  } as VerificationReport);
  mount("fixture-only-capability");
  expect(await screen.findByText("Inconclusive")).toBeInTheDocument();
  const table = screen.getByRole("table");
  expect(within(table).getByText("COMPLETED")).toBeInTheDocument();
  expect(
    within(table).queryByText("Verified", { exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Recovery success rate" }),
  ).toHaveTextContent("—");
});
it("announces a backend failure without presenting fictional saved runs", async () => {
  vi.mocked(missionApi.overview).mockRejectedValue(
    new Error("Overview unavailable"),
  );
  mount("fixture-only-capability");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Overview unavailable",
  );
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
