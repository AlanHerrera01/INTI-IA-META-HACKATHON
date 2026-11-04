import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import {
  ExecutionDashboard,
  ExecutionPage,
  ActionTimeline,
} from "../src/pages/ExecutionPage";
import { executionApi, mergeEvents } from "../src/services/executionApi";
import { verificationApi } from "../src/services/verificationApi";
import { ExecutionVerification } from "../src/features/execution/ExecutionVerification";
import type { ExecutionBundle, ExecutionEvent } from "../src/types/execution";
vi.mock("../src/services/verificationApi", () => ({
  verificationApi: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    report: vi.fn(),
  },
}));

vi.mock("../src/services/executionApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/executionApi")>()),
  executionApi: {
    history: vi.fn(),
    get: vi.fn(),
    prepare: vi.fn(),
    command: vi.fn(),
    events: vi.fn(),
  },
}));
const bundle = {
  session: {
    id: "execution-test",
    plan_id: "plan-test",
    status: "AWAITING_APPROVAL",
    current_action_index: 0,
    updated_at: "2026-10-28T12:00:00Z",
    started_at: null,
    completed_at: null,
    error_summary: null,
    overall_goal_verified: false,
    latest_observation_id: null,
  },
  manifest: {
    digest: "a".repeat(64),
    initial_url: "http://demo:8001/",
    viewport: { width: 1440, height: 900 },
    grounding_mode: "hybrid_dom",
    actions: [
      {
        id: "save",
        action_type: "click",
        target: { role: "button", name: "Save PC-104" },
        risk_level: "HIGH",
        preconditions: [],
        expected_postconditions: [],
        parameters: {},
      },
    ],
    plan_snapshot: {
      plan: { goal: "Find PC-104 and save Operational" },
      model_usage: [],
    },
  },
  decisions: [],
  results: [],
  plan_approved: false,
  browser_session: null,
} as unknown as ExecutionBundle;
class Socket {
  onopen = null;
  onmessage = null;
  onclose = null;
  onerror = null;
  send = vi.fn();
  close = vi.fn();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verificationApi.list).mockResolvedValue({ items: [], total: 0 });
  vi.stubGlobal("WebSocket", Socket);
  vi.mocked(executionApi.history).mockResolvedValue({
    items: [bundle],
    total: 1,
  });
  vi.mocked(executionApi.get).mockResolvedValue(bundle);
  vi.mocked(executionApi.events).mockResolvedValue([]);
});
function workspace() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExecutionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
it("shows actual progress, authorization and the goal verification distinction", () => {
  render(<ExecutionDashboard bundle={bundle} />);
  expect(screen.getByText("AWAITING_APPROVAL")).toBeInTheDocument();
  expect(screen.getAllByText("0 / 1")).toHaveLength(2);
  expect(screen.getByText(/not independently verified/)).toBeInTheDocument();
});
it("shows action failure evidence and grounding method", () => {
  render(
    <ActionTimeline
      bundle={{
        ...bundle,
        results: [
          {
            action_id: "save",
            status: "FAILED",
            action_executed: true,
            postconditions_satisfied: false,
            may_have_executed: false,
            error_code: "POSTCONDITION_FAILED",
            error_message: "Save receipt absent",
            resolution: {
              method: "accessible_role_or_label",
              bounding_box: null,
            },
          } as ExecutionBundle["results"][number],
        ],
      }}
    />,
  );
  expect(screen.getByText("FAILED")).toBeInTheDocument();
  expect(screen.getByText(/Save receipt absent/)).toBeInTheDocument();
  expect(screen.getByText(/accessible_role_or_label/)).toBeInTheDocument();
});
it("requires connection and explicit review before approving a plan", async () => {
  workspace();
  fireEvent.click(screen.getByText("Prepare a workflow"));
  expect(screen.getByRole("button", { name: /Prepare PC-104/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "test-token" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve Plan" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(executionApi.command).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Start Execution" }),
  ).toBeDisabled();
  vi.mocked(executionApi.command).mockResolvedValue({
    ...bundle,
    plan_approved: true,
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm plan" }));
  expect(
    await screen.findByRole("button", { name: "Confirm HIGH actions" }),
  ).toBeEnabled();
  expect(executionApi.command).toHaveBeenCalledWith(
    "execution-test",
    "test-token",
    "approve",
    expect.objectContaining({
      manifest_digest: bundle.manifest.digest,
      scope: "plan",
    }),
  );
});
it("renders backend errors", async () => {
  vi.mocked(executionApi.history).mockRejectedValue(
    new Error("Operator authorization required"),
  );
  workspace();
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "bad-token" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Operator authorization required",
  );
});
it("deduplicates reconnect history by persisted event ID and sequence", () => {
  const event = {
    id: "event",
    sequence: 5,
    event_type: "action_completed",
  } as ExecutionEvent;
  expect(
    mergeEvents([event], [event, { ...event, id: "earlier", sequence: 3 }]).map(
      (e) => e.id,
    ),
  ).toEqual(["earlier", "event"]);
});
it("enables pause and cancellation only for a running execution", () => {
  render(
    <ExecutionDashboard
      bundle={{
        ...bundle,
        session: {
          ...bundle.session,
          status: "RUNNING",
          started_at: "2026-10-28T11:59:50Z",
        },
      }}
    />,
  );
  expect(screen.getByText("RUNNING")).toBeInTheDocument();
  expect(screen.getByText("10.0s")).toBeInTheDocument();
});

async function connectWorkspace() {
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "test-token" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByRole("region", { name: "Task objective" });
}
it("opens the latest completed execution read-only with all execution commands disabled", async () => {
  vi.mocked(executionApi.get).mockResolvedValue({
    ...bundle,
    session: { ...bundle.session, status: "COMPLETED" },
  });
  workspace();
  await connectWorkspace();
  for (const name of ["Pause", "Resume", "Start Execution", "Cancel execution"])
    expect(screen.getByRole("button", { name })).toBeDisabled();
  expect(
    screen.getByText(/Saved execution. The browser is not presented/),
  ).toBeInTheDocument();
  expect(executionApi.command).not.toHaveBeenCalled();
  expect(executionApi.prepare).not.toHaveBeenCalled();
});
it("keeps HIGH approval separate and sends only the reviewed action IDs", async () => {
  vi.mocked(executionApi.get).mockResolvedValue({
    ...bundle,
    plan_approved: true,
  });
  vi.mocked(executionApi.command).mockResolvedValue({
    ...bundle,
    plan_approved: true,
    session: { ...bundle.session, status: "READY" },
  });
  workspace();
  await connectWorkspace();
  fireEvent.click(screen.getByRole("button", { name: "Confirm HIGH actions" }));
  expect(executionApi.command).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Confirm HIGH actions",
    }),
  );
  await waitFor(() =>
    expect(executionApi.command).toHaveBeenCalledWith(
      "execution-test",
      "test-token",
      "approve",
      {
        manifest_digest: bundle.manifest.digest,
        scope: "high_risk",
        action_ids: ["save"],
      },
    ),
  );
});
it("blocks approval if the execution manifest changes while its confirmation is open", async () => {
  const { client } = workspace();
  await connectWorkspace();
  fireEvent.click(screen.getByRole("button", { name: "Approve Plan" }));
  act(() => {
    client.setQueryData(["execution", "test-token", "execution-test"], {
      ...bundle,
      manifest: { ...bundle.manifest, digest: "b".repeat(64) },
    });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "manifest changed",
  );
  expect(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Confirm plan",
    }),
  ).toBeDisabled();
  expect(screen.getByText(bundle.manifest.digest)).toBeInTheDocument();
  expect(executionApi.command).not.toHaveBeenCalled();
});

it("withholds a cached success verdict when the independent report cannot be refreshed", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["execution-verification-report", "report-fixture", "test-token"],
    { effective_verdict: "VERIFIED_SUCCESS" },
  );
  vi.mocked(verificationApi.list).mockResolvedValue({
    items: [{ session: { id: "report-fixture" } }],
    total: 1,
  } as unknown as Awaited<ReturnType<typeof verificationApi.list>>);
  vi.mocked(verificationApi.report).mockRejectedValue(
    new Error("Verifier unavailable"),
  );
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExecutionVerification id="execution-test" token="test-token" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText(
      "Verification service unavailable. No outcome can be confirmed here.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("NOT VERIFIED");
  expect(screen.queryByText("VERIFIED_SUCCESS")).not.toBeInTheDocument();
});
