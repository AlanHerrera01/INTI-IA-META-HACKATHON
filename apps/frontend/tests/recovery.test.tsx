import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { RecoveryPage, RecoveryOverview } from "../src/pages/RecoveryPage";
import { recoveryApi } from "../src/services/recoveryApi";
import type { RecoveryBundle } from "../src/types/recovery";
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
  fireEvent.click(
    await screen.findByRole("button", { name: /AWAITING_APPROVAL/ }),
  );
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
