import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { RecoveryPage, RecoveryOverview } from "../src/pages/RecoveryPage";
import { recoveryApi } from "../src/services/recoveryApi";
import type { RecoveryBundle } from "../src/types/recovery";
import { recoveryMetrics } from "../src/features/recovery/metrics";
import { executionApi } from "../src/services/executionApi";
vi.mock("../src/services/api", () => ({
  api: {
    observation: vi.fn().mockResolvedValue({
      timestamp: "2026-10-30T12:00:00Z",
      width: 1440,
      height: 900,
    }),
  },
  errorMessage: (error: Error) => error.message,
}));
vi.mock("../src/services/recoveryApi", () => ({
  recoveryApi: {
    list: vi.fn(),
    get: vi.fn(),
    events: vi.fn(),
    approve: vi.fn(),
    control: vi.fn(),
  },
}));
vi.mock("../src/services/executionApi", () => ({
  executionApi: { screenshot: vi.fn().mockResolvedValue(new Blob()) },
}));
const bundle = {
  session: {
    id: "repair",
    execution_id: "execution",
    status: "AWAITING_APPROVAL",
    initial_failure_type: "LABEL_CHANGED",
    started_at: new Date().toISOString(),
    completed_at: null,
    final_outcome: null,
    attempts_count: 1,
    model_calls: 1,
    actions_used: 0,
    tokens_used: 20,
    retry_allowed: false,
    evidence_ids: [],
    budget: {
      max_attempts: 3,
      max_model_calls: 5,
      max_actions: 10,
      max_duration_seconds: 120,
      max_tokens_optional: null,
    },
  },
  context: {
    observed_state: "Save label changed",
    error_details: "TARGET_UNRESOLVED",
    previous_observation_id: "before",
    current_observation_id: "after",
  },
  diagnoses: [
    {
      id: "diagnosis",
      failure_type: "LABEL_CHANGED",
      change_summary: "Visible alternate label",
      observed_facts: ["Update Record is visible"],
      hypotheses: ["May be the same save control"],
      uncertainties: [],
      candidate_targets: [],
    },
  ],
  plan: {
    digest: "a".repeat(64),
    objective: "Change asset PC-104 status to Operational.",
    decision: {
      justification: "Validated bounded repair",
      requires_approval: true,
      assumptions: [],
    },
    actions: [
      {
        id: "high",
        action_type: "click",
        risk_level: "HIGH",
        target: { name: "Update Record", role: "button" },
        parameters: {},
        preconditions: [],
        expected_postconditions: [],
      },
    ],
  },
  plan_approved: false,
  decisions: [],
  attempts: [],
  results: [],
  warnings: [],
} as unknown as RecoveryBundle;
class Socket {
  onopen = null;
  onclose = null;
  onerror = null;
  onmessage = null;
  send = vi.fn();
  close = vi.fn();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:test",
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.mocked(recoveryApi.list).mockResolvedValue({ items: [bundle], total: 1 });
  vi.mocked(recoveryApi.get).mockResolvedValue(bundle);
  vi.mocked(recoveryApi.events).mockResolvedValue([]);
});
it("keeps recovery outcome distinct from independent verification", () => {
  render(
    <RecoveryOverview
      bundle={{
        ...bundle,
        session: { ...bundle.session, status: "RECOVERED" },
      }}
    />,
  );
  expect(screen.getByText("Recovery · RECOVERED")).toBeInTheDocument();
  expect(screen.queryByText("VERIFIED_SUCCESS")).not.toBeInTheDocument();
  expect(screen.getByText("1 / 3")).toBeInTheDocument();
});
it("requires explicit review and confirmation before authorizing repair scope", async () => {
  vi.mocked(recoveryApi.approve).mockResolvedValue({
    ...bundle,
    plan_approved: true,
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <RecoveryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "test-operator" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(
    await screen.findByText("Update Record is visible"),
  ).toBeInTheDocument();
  expect(screen.getByText("May be the same save control")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Review HIGH risk actions" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Review plan approval" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(recoveryApi.approve).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm authorization" }),
  );
  await screen.findByRole("button", { name: "Review HIGH risk actions" });
  expect(recoveryApi.approve).toHaveBeenCalledWith(
    bundle,
    "test-operator",
    "plan",
    [],
  );
});

function workspace() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RecoveryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
async function connect() {
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "test-operator" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
}
it("renders a truthful empty comparison without invented recovery results or images", async () => {
  vi.mocked(recoveryApi.list).mockResolvedValue({ items: [], total: 0 });
  workspace();
  await connect();
  expect(
    await screen.findByText(/No recovery records yet. Recovery begins/),
  ).toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Recovery rate on loaded page" }),
    ).getByText("Unavailable"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Recovery pipeline" })).getByText(
      "AWAITING EVIDENCE",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export record" })).toBeDisabled();
  expect(executionApi.screenshot).not.toHaveBeenCalled();
  expect(recoveryApi.control).not.toHaveBeenCalled();
  expect(recoveryApi.approve).not.toHaveBeenCalled();
});
it("opens a recovered case read-only without equating recovery to independently verified success", async () => {
  vi.mocked(recoveryApi.get).mockResolvedValue({
    ...bundle,
    session: { ...bundle.session, status: "RECOVERED" },
  });
  workspace();
  await connect();
  await screen.findByText(/Recorded Recovery Case/);
  for (const name of [
    "Cancel recovery and execution",
    "Retry within remaining budget",
    "Review plan approval",
    "Review HIGH risk actions",
  ])
    expect(screen.getByRole("button", { name })).toBeDisabled();
  expect(screen.queryByText("VERIFIED_SUCCESS")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Verify persisted outcome/ }),
  ).toHaveAttribute("href", "/verification?execution=execution");
});
it("freezes the reviewed repair digest and blocks confirmation when it changes", async () => {
  const { client } = workspace();
  await connect();
  fireEvent.click(
    await screen.findByRole("button", { name: "Review plan approval" }),
  );
  const changed = {
    ...bundle,
    plan: { ...bundle.plan!, digest: "b".repeat(64) },
  };
  vi.mocked(recoveryApi.get).mockResolvedValue(changed);
  act(() => {
    client.setQueryData(["recovery", "test-operator", "repair"], changed);
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Confirm authorization" }),
    ).toBeDisabled(),
  );
  expect(
    within(screen.getByRole("dialog")).getByText(bundle.plan!.digest),
  ).toBeInTheDocument();
  expect(recoveryApi.approve).not.toHaveBeenCalled();
});
it("sends only explicitly reviewed HIGH action IDs after separate plan approval", async () => {
  const approved = { ...bundle, plan_approved: true };
  vi.mocked(recoveryApi.get).mockResolvedValue(approved);
  vi.mocked(recoveryApi.approve).mockResolvedValue(approved);
  workspace();
  await connect();
  fireEvent.click(
    await screen.findByRole("button", { name: "Review HIGH risk actions" }),
  );
  expect(recoveryApi.approve).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm authorization" }),
  );
  await waitFor(() =>
    expect(recoveryApi.approve).toHaveBeenCalledWith(
      approved,
      "test-operator",
      "high_risk",
      ["high"],
    ),
  );
});
it("requests a retry only after confirmation and only when the backend permits it", async () => {
  const escalated = {
    ...bundle,
    session: { ...bundle.session, status: "ESCALATED", retry_allowed: true },
  };
  vi.mocked(recoveryApi.get).mockResolvedValue(escalated);
  vi.mocked(recoveryApi.control).mockResolvedValue(escalated);
  workspace();
  await connect();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Retry within remaining budget" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Retry within remaining budget",
    }),
  );
  expect(recoveryApi.control).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm authorization" }),
  );
  await waitFor(() =>
    expect(recoveryApi.control).toHaveBeenCalledWith(
      "repair",
      "retry",
      "test-operator",
    ),
  );
});
it("requires a concrete confirmation before cancelling recovery and execution", async () => {
  vi.mocked(recoveryApi.control).mockResolvedValue(bundle);
  workspace();
  await connect();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Cancel recovery and execution" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Cancel recovery and execution",
    }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "Changes already persisted remain saved.",
  );
  expect(recoveryApi.control).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm authorization" }),
  );
  await waitFor(() =>
    expect(recoveryApi.control).toHaveBeenCalledWith(
      "repair",
      "cancel",
      "test-operator",
    ),
  );
});
it("removes cached recovery evidence and disables commands when its refresh fails", async () => {
  const { client } = workspace();
  await connect();
  await screen.findByText(/Recorded Recovery Case/);
  vi.mocked(recoveryApi.get).mockRejectedValue(
    new Error("Recovery detail unavailable"),
  );
  await act(async () => {
    await client.refetchQueries({
      queryKey: ["recovery", "test-operator", "repair"],
    });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Recovery detail unavailable",
  );
  expect(screen.queryByText(/Recorded Recovery Case/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export record" })).toBeDisabled();
});
it("leaves recovery rate unavailable for an empty or unresolved-only sample", () => {
  expect(recoveryMetrics([])).toMatchObject({
    rate: null,
    meanMs: null,
    resolved: 0,
  });
  expect(recoveryMetrics([bundle])).toMatchObject({ rate: null, escalated: 0 });
});
it("computes scoped outcome ratios separately from valid recorded duration samples", () => {
  const recovered = {
    ...bundle,
    session: {
      ...bundle.session,
      status: "RECOVERED",
      started_at: "2026-10-30T12:00:00Z",
      completed_at: "2026-10-30T12:00:02Z",
    },
  };
  const failed = {
    ...bundle,
    session: {
      ...bundle.session,
      status: "FAILED",
      started_at: "invalid",
      completed_at: "invalid",
    },
  };
  const escalated = {
    ...bundle,
    session: { ...bundle.session, status: "ESCALATED" },
  };
  expect(recoveryMetrics([recovered, failed, escalated])).toMatchObject({
    rate: 50,
    resolved: 2,
    recovered: 1,
    escalated: 1,
    meanMs: 2000,
    durationSamples: 1,
  });
});
it("displays protected history failures", async () => {
  vi.mocked(recoveryApi.list).mockRejectedValue(
    new Error("Recovery unavailable"),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <RecoveryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "test-operator" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Recovery unavailable",
  );
});
