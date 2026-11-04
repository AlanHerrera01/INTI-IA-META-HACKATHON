import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { LocalWorkflowPage } from "../src/pages/LocalWorkflowPage";
import { OperatorProvider } from "../src/app/OperatorContext";
import { computerApi, type ComputerTask } from "../src/services/computerApi";
import { localMetrics } from "../src/features/computer/workflow";
import { navigation, computerNavigation } from "../src/app/navigation";

vi.mock("../src/services/computerApi", () => ({
  computerApi: {
    state: vi.fn(),
    applications: vi.fn(),
    prepare: vi.fn(),
    prepareApplication: vi.fn(),
  },
}));
vi.mock("../src/hooks/useSystem", () => ({
  useModel: () => ({ data: { configured: false } }),
}));
const task: ComputerTask = {
  id: "local-failed",
  device_id: "paired-device",
  status: "INTERRUPTED",
  digest: "a".repeat(64),
  created_at: 1,
  updated_at: 2,
  plan: {
    id: "local-failed",
    device_id: "paired-device",
    authorized_root: "C:\\Allowed",
    filename: "note.txt",
    content: "Keep the real content",
    url: "https://example.com",
    source: "authored_local_sample",
  },
  steps: [],
  result: { ok: false, steps: [], error: "Interrupted fixture" },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(computerApi.state).mockResolvedValue({
    devices: [
      {
        id: "paired-device",
        name: "Actual paired device",
        platform: "win32",
        root: "C:\\Allowed",
        last_seen: Date.now() / 1000,
        revoked: 0,
      },
    ],
    tasks: [task],
    model_calls: 0,
    planning_mode: "authored_local_sample",
  });
  vi.mocked(computerApi.applications).mockResolvedValue({
    applications: [],
    scanned_at: null,
  });
});
function mount(view: "overview" | "recovery" | "verification") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OperatorProvider>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<LocalWorkflowPage view={view} />} />
            <Route
              path="/planning"
              element={<p>New draft awaits exact approval</p>}
            />
          </Routes>
        </MemoryRouter>
      </OperatorProvider>
    </QueryClientProvider>,
  );
}
async function connect() {
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "fixture-local-token" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
}
it("retains every original navigation target and gives computer pages independent paths", () => {
  expect(navigation.map((item) => item.to)).toEqual([
    "/",
    "/planning",
    "/execution",
    "/observations",
    "/tasks",
    "/inventory",
    "/recovery",
    "/verification",
    "/benchmarks",
    "/models",
    "/activity",
    "/system",
  ]);
  expect(
    computerNavigation.every((item) => item.to.startsWith("/computer")),
  ).toBe(true);
  expect(
    new Set([...navigation, ...computerNavigation].map((item) => item.to)).size,
  ).toBe(15);
});
it("does not call local protected state before connecting and shows real device context", async () => {
  mount("overview");
  expect(computerApi.state).not.toHaveBeenCalled();
  await connect();
  expect(await screen.findByText("Actual paired device")).toBeInTheDocument();
  expect(screen.getByText("C:\\Allowed")).toBeInTheDocument();
  expect(screen.queryByText("PC-104")).not.toBeInTheDocument();
});
it("recovery prepares a new draft with original content and never approves or replays a task", async () => {
  vi.mocked(computerApi.prepare).mockResolvedValue({
    ...task,
    id: "new-reviewed-draft",
    status: "DRAFT",
  });
  mount("recovery");
  await connect();
  const button = await screen.findByRole("button", {
    name: "Prepare a new reviewed draft",
  });
  vi.spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  fireEvent.click(button);
  expect(computerApi.prepare).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() =>
    expect(computerApi.prepare).toHaveBeenCalledWith("fixture-local-token", {
      device_id: "paired-device",
      filename: "note.txt",
      content: "Keep the real content",
      url: "https://example.com",
    }),
  );
  expect(
    await screen.findByText("New draft awaits exact approval"),
  ).toBeInTheDocument();
});
it("keeps launch requests separate from file verification and task completion", () => {
  const launch: ComputerTask = {
    ...task,
    status: "COMPLETED",
    result: {
      ok: true,
      steps: [{ id: "open_application", status: "LAUNCH_REQUESTED" }],
    },
  };
  const stats = localMetrics([launch]);
  expect(stats.completed).toBe(1);
  expect(stats.launches).toBe(1);
  expect(stats.fileReadbacks).toBe(0);
});
it("verification shows the evidence limit without inventing independent visual success", async () => {
  mount("verification");
  await connect();
  const region = await screen.findByRole("heading", {
    name: "Recorded verification evidence",
  });
  expect(
    within(region.parentElement!.parentElement!).getByText(
      /Independent desktop visual verification is not yet available/,
    ),
  ).toBeInTheDocument();
});
