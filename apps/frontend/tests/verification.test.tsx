import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import {
  VerificationPage,
  VerificationOverview,
  CriteriaInspector,
  ExecutionVerificationComparison,
} from "../src/pages/VerificationPage";
import { verificationApi } from "../src/services/verificationApi";
import { mergeRecordEvents } from "../src/hooks/useRecordEvents";
import type {
  VerificationBundle,
  VerificationReport,
  RecordEvent,
} from "../src/types/verification";

vi.mock("../src/services/verificationApi", () => ({
  verificationApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    cancel: vi.fn(),
    report: vi.fn(),
    events: vi.fn(),
    artifact: vi.fn(),
  },
}));
const bundle = {
  session: {
    id: "verification-test",
    task_id: "task-test",
    execution_id: "execution-test",
    criteria_version_id: "version-test",
    status: "COMPLETED",
    started_at: "2026-10-29T12:00:00Z",
    completed_at: "2026-10-29T12:00:02Z",
    final_verdict: "VERIFIED_FAILURE",
    limitations: [],
    error_code: null,
    evidence_ids: [],
    criteria_results: [
      {
        criterion_id: "status",
        status: "FAIL",
        observed_value: "Inactive",
        expected_value: "Operational",
        evidence_ids: [],
        explanation: "Persisted status differs from the approved value",
      },
    ],
  },
  criteria_version: {
    id: "version-test",
    version: 1,
    objective: "Change asset PC-104 status to Operational.",
    digest: "a".repeat(64),
    baseline: null,
    criteria: [
      {
        id: "status",
        task_id: "task-test",
        description: "PC-104 has persisted status Operational",
        assertion_type: "equals",
        expected_value: "Operational",
        target_reference: {
          record_id: "PC-104",
          field: "status",
          application: "inventory",
        },
        required: true,
        evidence_requirements: [
          { evidence_type: "DATABASE_STATE", min_count: 1 },
        ],
      },
    ],
  },
  evidence: [],
} as unknown as VerificationBundle;
const report = {
  project: "INTI AI",
  task_id: "task-test",
  execution_id: "execution-test",
  verification_id: "verification-test",
  original_objective: bundle.criteria_version.objective,
  criteria_version: bundle.criteria_version,
  verification: bundle.session,
  execution_summary: {
    status: "COMPLETED",
    declared_overall_goal_verified: false,
    action_count: 9,
    actions_executed: 9,
    immediate_postconditions_passed: 9,
  },
  evidence: [],
  criteria_results: bundle.session.criteria_results,
  final_verdict: "VERIFIED_FAILURE",
  effective_verdict: "VERIFIED_FAILURE",
  integrity_checks: [],
  limitations: [],
} satisfies VerificationReport;
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
  vi.mocked(verificationApi.list).mockResolvedValue({
    items: [bundle],
    total: 1,
  });
  vi.mocked(verificationApi.get).mockResolvedValue(bundle);
  vi.mocked(verificationApi.report).mockResolvedValue(report);
  vi.mocked(verificationApi.events).mockResolvedValue([]);
});
function workspace() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <VerificationPage />
    </QueryClientProvider>,
  );
}
it("does not infer a verification verdict from execution completion", () => {
  render(<VerificationOverview bundle={bundle} />);
  expect(screen.getByText("NOT VERIFIED")).toHaveAttribute("role", "status");
  expect(
    screen.getByText("Verification status: COMPLETED"),
  ).toBeInTheDocument();
  expect(screen.queryByText("VERIFIED_SUCCESS")).not.toBeInTheDocument();
});
it("shows completed execution separately from independently proven failure", () => {
  render(<ExecutionVerificationComparison report={report} />);
  expect(screen.getByText("COMPLETED")).toBeInTheDocument();
  expect(screen.getByText("Inactive")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("VERIFIED_FAILURE");
});
it("shows UNKNOWN instead of converting missing evidence into PASS", () => {
  const unknown = {
    ...bundle,
    session: {
      ...bundle.session,
      criteria_results: [
        {
          ...bundle.session.criteria_results[0],
          status: "UNKNOWN" as const,
          observed_value: null,
        },
      ],
    },
  };
  render(<CriteriaInspector bundle={unknown} />);
  expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
  expect(screen.queryByText("PASS", { exact: true })).not.toBeInTheDocument();
});
it("downgrades the displayed effective verdict when evidence integrity fails", () => {
  const corrupted = {
    ...report,
    final_verdict: "VERIFIED_SUCCESS" as const,
    effective_verdict: "INCONCLUSIVE" as const,
    integrity_checks: [
      {
        evidence_id: "artifact",
        intact: false,
        error: "EVIDENCE_HASH_OR_SIZE_MISMATCH",
      },
    ],
  };
  render(<VerificationOverview bundle={bundle} report={corrupted} />);
  expect(screen.getByRole("status")).toHaveTextContent("INCONCLUSIVE");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "integrity or provenance",
  );
});
it("requires an operator connection and loads real API history and reports", async () => {
  workspace();
  expect(
    screen.getByRole("button", { name: "Verify execution" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "test-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /VERIFIED_FAILURE/ }),
  );
  expect(
    await screen.findByText("Execution vs verification"),
  ).toBeInTheDocument();
  expect(verificationApi.get).toHaveBeenCalledWith(
    "verification-test",
    "test-capability",
  );
  expect(
    screen.getByRole("button", { name: "Cancel verification" }),
  ).toBeDisabled();
});
it("renders source/backend errors without a fabricated success", async () => {
  vi.mocked(verificationApi.list).mockRejectedValue(
    new Error("Independent verification is not configured"),
  );
  workspace();
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "test-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("not configured");
  expect(screen.queryByText("VERIFIED_SUCCESS")).not.toBeInTheDocument();
});
it("deduplicates execution-stream and REST replay by stable event identity", () => {
  const event = {
    id: "event",
    event_type: "criterion_evaluated",
    timestamp: "2026-10-29T12:00:00Z",
    sequence: 900,
    payload: {},
  } satisfies RecordEvent;
  expect(mergeRecordEvents([event], [{ ...event, sequence: 3 }])).toHaveLength(
    1,
  );
});
