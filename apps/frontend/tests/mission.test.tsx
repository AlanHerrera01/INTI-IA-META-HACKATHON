import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { MissionControl, GuidedTracker } from "../src/pages/MissionControl";
import { OperatorProvider } from "../src/app/OperatorContext";
import { missionApi, benchmarkApi } from "../src/services/missionApi";
import { RatioMetric } from "../src/components/RatioMetric";
import type { MissionDetail, MissionOverview } from "../src/types/mission";

vi.mock("../src/services/missionApi", () => ({
  missionApi: {
    overview: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    prepare: vi.fn(),
    demo: vi.fn(),
    reset: vi.fn(),
    arm: vi.fn(),
  },
  benchmarkApi: { list: vi.fn() },
}));
vi.mock("../src/hooks/useSystem", () => ({
  useSystem: () => ({ data: { backend: true, database: true, browser: true } }),
  useModel: () => ({ data: { configured: false, available: null } }),
}));
const mission = {
  id: "test-mission",
  objective: "Change asset PC-104 status to Operational.",
  mode: "authored_demo" as const,
  status: "CREATED",
  created_at: "2026-10-30T12:00:00Z",
  fault_injected: false,
  error_code: null,
};
const detail = {
  mission,
  plan: null,
  execution: null,
  phase: "CREATED",
  events: [],
  recoveries: [],
  verifications: [],
  verification_report: null,
} as unknown as MissionDetail;
const overview = {
  missions: [],
  mission_count: 0,
  active_executions: 0,
  recent_events: [],
  recent_verifications: [],
  latest_verdict: null,
  model_calls_enabled: false,
  demo_controls_enabled: true,
  features: {
    execution_enabled: true,
    verification_enabled: true,
    recovery_enabled: true,
    recovery_live_model_enabled: false,
    demo_controls_enabled: true,
  },
} as unknown as MissionOverview;
const demo = {
  store_id: "test-synthetic-store",
  synthetic: true,
  faults_active: false,
  asset: { id: "PC-104", status: "Inactive", version: 1 },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(missionApi.overview).mockResolvedValue(overview);
  vi.mocked(missionApi.get).mockResolvedValue(detail);
  vi.mocked(missionApi.create).mockResolvedValue(
    mission as MissionDetail["mission"],
  );
  vi.mocked(missionApi.demo).mockResolvedValue(demo);
  vi.mocked(missionApi.reset).mockResolvedValue(demo);
  vi.mocked(benchmarkApi.list).mockResolvedValue({
    items: [],
    unavailable: [],
    comparative_evaluation_available: false,
  });
});
function workspace() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OperatorProvider>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<MissionControl />} />
            <Route path="/missions/:id" element={<MissionControl />} />
          </Routes>
        </MemoryRouter>
      </OperatorProvider>
    </QueryClientProvider>,
  );
}
async function connect() {
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "explicit-test-only-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByText("No missions yet. Create a task above to begin.");
}
it("requires a capability and keeps the authored planning source explicit", async () => {
  workspace();
  expect(screen.getByRole("button", { name: "Create mission" })).toBeDisabled();
  await connect();
  fireEvent.click(screen.getByRole("button", { name: "Create mission" }));
  await screen.findByText("Task ID:");
  expect(missionApi.create).toHaveBeenCalledWith(
    expect.stringContaining("PC-104"),
    "authored_demo",
    "explicit-test-only-capability",
  );
  expect(
    screen.getByRole("button", { name: "Capture interface & prepare plan" }),
  ).toBeEnabled();
  expect(screen.getByText(/AUTHORED PLAN/)).toHaveTextContent(
    "NO MODEL REASONING",
  );
});
it("requires confirmation before resetting the marked synthetic store", async () => {
  workspace();
  await connect();
  fireEvent.click(await screen.findByRole("button", { name: "Reset demo" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("test-synthetic-store");
  expect(missionApi.reset).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm synthetic reset" }),
  );
  await waitFor(() =>
    expect(missionApi.reset).toHaveBeenCalledWith(
      "test-synthetic-store",
      "explicit-test-only-capability",
    ),
  );
});
it("announces backend failures without inventing a mission result", async () => {
  vi.mocked(missionApi.create).mockRejectedValue(
    new Error("Mission service unavailable"),
  );
  workspace();
  await connect();
  fireEvent.click(screen.getByRole("button", { name: "Create mission" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Mission service unavailable",
  );
});
function step(name: string) {
  return screen.getByText(name, { exact: true }).closest("li")!;
}
it("does not mark a partial execution or plan-only approval complete", () => {
  const d = {
    ...detail,
    execution: {
      session: { status: "RUNNING" },
      plan_approved: true,
      manifest: { actions: [{ id: "save" }] },
      decisions: [],
      results: [{ status: "RUNNING" }],
    },
  } as unknown as MissionDetail;
  render(<GuidedTracker detail={d} canModel={false} hasBenchmark={false} />);
  expect(step("Authorize execution")).not.toHaveClass("done");
  expect(step("Execute in a real browser")).not.toHaveClass("done");
  expect(
    within(step("Execute in a real browser")).getByText(/not complete/),
  ).toBeInTheDocument();
});
it("keeps escalated recovery blocked and collection without a verdict pending", () => {
  const d = {
    ...detail,
    recoveries: [{ session: { status: "ESCALATED" } }],
    verifications: [{ session: { status: "COLLECTING_EVIDENCE" } }],
  } as unknown as MissionDetail;
  render(<GuidedTracker detail={d} canModel={true} hasBenchmark={true} />);
  expect(step("Inject fault and recover")).toHaveClass("blocked");
  expect(step("Independent verification")).not.toHaveClass("done");
});
it("presents a completed independent failure as its actual verdict", () => {
  const d = {
    ...detail,
    verification_report: {
      effective_verdict: "VERIFIED_FAILURE",
      criteria_version: { baseline: null },
    },
    verifications: [{ session: { status: "COMPLETED" } }],
  } as unknown as MissionDetail;
  render(<GuidedTracker detail={d} canModel={false} hasBenchmark={true} />);
  expect(step("Independent verification")).toHaveTextContent(
    "VERIFIED_FAILURE",
  );
  expect(screen.queryByText("VERIFIED_SUCCESS")).not.toBeInTheDocument();
});
it("displays measured denominators and leaves absent metrics unavailable", () => {
  render(
    <>
      <RatioMetric
        label="Fixture ratio"
        ratio={{ numerator: 3, denominator: 5 }}
      />
      <RatioMetric label="Unmeasured" ratio={undefined} />
    </>,
  );
  expect(screen.getByText("60.0%")).toBeInTheDocument();
  expect(screen.getByText("3 / 5")).toBeInTheDocument();
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
});
