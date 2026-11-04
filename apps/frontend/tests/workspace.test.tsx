import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { ActivityPage } from "../src/pages/ActivityPage";
import { TaskManager } from "../src/pages/TaskManager";
import { WorkspaceSearch } from "../src/components/WorkspaceSearch";
import { OperatorProvider } from "../src/app/OperatorContext";
import { missionApi } from "../src/services/missionApi";
import type { Mission, MissionDetail } from "../src/types/mission";

vi.mock("../src/services/missionApi", () => ({
  missionApi: { list: vi.fn(), get: vi.fn(), overview: vi.fn() },
}));
const ready = {
  id: "ready-mission",
  objective: "Update PC-104",
  status: "PLAN_READY",
  mode: "authored_demo",
  created_at: "2026-10-30T12:00:00Z",
} as Mission;
const failed = {
  ...ready,
  id: "failed-mission",
  objective: "Inspect another asset",
  status: "FAILED",
  mode: "meta",
  error_code: "MODEL_CALLS_DISABLED",
} as Mission;
const readyDetail = {
  mission: ready,
  plan: null,
  execution: {
    session: {
      id: "execution-fixture",
      status: "COMPLETED",
      started_at: null,
      completed_at: null,
      updated_at: ready.created_at,
    },
    manifest: { actions: [] },
    results: [],
  },
  verification_report: null,
  recoveries: [],
  verifications: [],
} as unknown as MissionDetail;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(missionApi.list).mockResolvedValue({
    items: [ready, failed],
    total: 2,
  });
  vi.mocked(missionApi.get).mockImplementation(async (id) =>
    id === failed.id
      ? { ...readyDetail, mission: failed, execution: null }
      : readyDetail,
  );
});
function mountTasks() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <OperatorProvider>
        <MemoryRouter>
          <TaskManager />
        </MemoryRouter>
      </OperatorProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
async function connect() {
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "test-only-operator-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByRole("table");
}
it("loads protected history only after connecting and keeps preparation separate from verification", async () => {
  mountTasks();
  expect(missionApi.list).not.toHaveBeenCalled();
  await connect();
  expect(missionApi.list).toHaveBeenCalledWith(
    "test-only-operator-capability",
    0,
  );
  expect(
    within(screen.getByRole("table")).getByText("PLAN READY"),
  ).toBeInTheDocument();
  const inspector = screen.getByRole("complementary", {
    name: "Selected mission",
  });
  expect(await within(inspector).findByText("COMPLETED")).toBeInTheDocument();
  expect(within(inspector).getByText("NOT VERIFIED")).toBeInTheDocument();
});
it("filters by objective and preparation state within the loaded page", async () => {
  mountTasks();
  await connect();
  fireEvent.change(screen.getByLabelText("Search missions on this page"), {
    target: { value: "another" },
  });
  expect(
    within(screen.getByRole("table")).queryByText("Update PC-104"),
  ).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("table")).getByText("Inspect another asset"),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Preparation status"), {
    target: { value: "PLAN_READY" },
  });
  expect(
    screen.getByText("No missions match these filters on this page."),
  ).toBeInTheDocument();
  expect(screen.getByText(/filters apply to this page/)).toBeInTheDocument();
});
it("pages through the persisted mission list without claiming a global filtered count", async () => {
  vi.mocked(missionApi.list).mockResolvedValue({ items: [ready], total: 21 });
  mountTasks();
  await connect();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(missionApi.list).toHaveBeenCalledWith(
      "test-only-operator-capability",
      20,
    ),
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled(),
  );
});
it("reports history errors without presenting an empty successful ledger", async () => {
  vi.mocked(missionApi.list).mockRejectedValue(
    new Error("History unavailable"),
  );
  mountTasks();
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "test-only-operator-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "History unavailable",
  );
  expect(screen.queryByText(/No missions yet/)).not.toBeInTheDocument();
});
function mountSearch() {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  render(
    <MemoryRouter>
      <WorkspaceSearch />
      <Routes>
        <Route path="/tasks" element={<h1>Task destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

it("filters completed executions separately from failed preparation and recovery", async () => {
  mountTasks();
  await connect();
  await waitFor(() =>
    expect(
      screen.getByText(/2 of 2 task details available/),
    ).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Completed/ }));
  expect(screen.getByRole("table")).toHaveTextContent("Update PC-104");
  expect(screen.getByRole("table")).not.toHaveTextContent(
    "Inspect another asset",
  );
  fireEvent.click(screen.getByRole("button", { name: /^Recovered/ }));
  expect(
    screen.getByText("No missions match these filters on this page."),
  ).toBeInTheDocument();
  expect(missionApi.get).toHaveBeenCalledWith(
    failed.id,
    "test-only-operator-capability",
  );
});
it("selects a failed preparation without retaining another task's execution evidence", async () => {
  mountTasks();
  await connect();
  fireEvent.click(
    screen.getByRole("button", { name: `Inspect mission ${failed.id}` }),
  );
  const inspector = within(
    screen.getByRole("complementary", { name: "Selected mission" }),
  );
  expect(
    await inspector.findByText("No screenshot recorded for this task."),
  ).toBeInTheDocument();
  expect(inspector.getByText("MODEL_CALLS_DISABLED")).toBeInTheDocument();
  expect(inspector.queryByText("COMPLETED")).not.toBeInTheDocument();
  expect(
    inspector.queryByRole("link", { name: "Live Console" }),
  ).not.toBeInTheDocument();
});
it("hides cached verification success when refreshing the selected task fails", async () => {
  const { client } = mountTasks();
  await connect();
  act(() => {
    client.setQueryData(
      ["mission", ready.id, "test-only-operator-capability"],
      {
        ...readyDetail,
        verification_report: { effective_verdict: "VERIFIED_SUCCESS" },
      },
    );
  });
  const inspector = within(
    screen.getByRole("complementary", { name: "Selected mission" }),
  );
  expect(await inspector.findByText("VERIFIED_SUCCESS")).toBeInTheDocument();
  vi.mocked(missionApi.get).mockRejectedValue(
    new Error("Task detail unavailable"),
  );
  await act(async () => {
    await client.refetchQueries({
      queryKey: ["mission", ready.id, "test-only-operator-capability"],
    });
  });
  expect(await inspector.findByRole("alert")).toHaveTextContent(
    "Task detail unavailable",
  );
  expect(inspector.queryByText("VERIFIED_SUCCESS")).not.toBeInTheDocument();
  expect(inspector.getByText("NOT VERIFIED")).toBeInTheDocument();
  expect(inspector.getByRole("button", { name: "JSON Trace" })).toBeDisabled();
});
it("opens workspace search with Ctrl+K and navigates to a selected result", async () => {
  mountSearch();
  fireEvent.keyDown(document, { ctrlKey: true, key: "k" });
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("Workspace name")).toHaveFocus();
  fireEvent.change(within(dialog).getByLabelText("Workspace name"), {
    target: { value: "task" },
  });
  expect(
    within(dialog).queryByRole("link", { name: /Recovery Center/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("link", { name: /Task Manager/ }));
  expect(
    await screen.findByRole("heading", { name: "Task destination" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("shows unmatched workspace searches and provides an explicit close control", () => {
  mountSearch();
  fireEvent.click(screen.getByRole("button", { name: "Search workspaces" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Workspace name"), {
    target: { value: "unknown-workspace" },
  });
  expect(within(dialog).getByRole("status")).toHaveTextContent(
    "No workspace matches",
  );
  expect(
    within(dialog).getByRole("button", { name: "Close workspace search" }),
  ).toBeInTheDocument();
  // jsdom does not implement native dialog form submission; the real-browser check covers it.
});

it("keeps activity protected and filters the bounded real-event window", async () => {
  vi.mocked(missionApi.overview).mockResolvedValue({
    recent_events: [
      {
        id: "event-1",
        source: "execution",
        event_type: "action_started",
        timestamp: "2026-10-30T12:00:00Z",
      },
      {
        id: "event-2",
        source: "verification",
        event_type: "criterion_evaluated",
        timestamp: "2026-10-30T12:00:01Z",
      },
    ],
  } as unknown as Awaited<ReturnType<typeof missionApi.overview>>);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OperatorProvider>
        <MemoryRouter>
          <ActivityPage />
        </MemoryRouter>
      </OperatorProvider>
    </QueryClientProvider>,
  );
  expect(missionApi.overview).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "test-only-operator-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  const feed = screen.getByRole("region", { name: "Recent persisted events" });
  await within(feed).findByRole("heading", { name: "action started" });
  fireEvent.change(screen.getByLabelText("Event source"), {
    target: { value: "verification" },
  });
  expect(feed).not.toHaveTextContent("action started");
  expect(feed).toHaveTextContent("criterion evaluated");
  expect(
    screen.getByText(/not the complete historical audit ledger/),
  ).toBeInTheDocument();
});
