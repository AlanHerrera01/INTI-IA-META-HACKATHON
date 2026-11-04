import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { BenchmarkPage } from "../src/pages/BenchmarkPage";
import { benchmarkApi } from "../src/services/missionApi";
import { downloadTaskJson } from "../src/features/tasks/records";
import type { BenchmarkArtifact } from "../src/types/mission";

vi.mock("../src/services/missionApi", () => ({
  benchmarkApi: { list: vi.fn() },
}));
vi.mock("../src/features/tasks/records", () => ({ downloadTaskJson: vi.fn() }));
const verification: BenchmarkArtifact = {
  report_id: "verification",
  filename: "fixture-verification.json",
  sha256: "a".repeat(64),
  evaluation_mode: "labeled_local_verifier_fixture",
  limitations: ["Unit fixture, not live model evidence."],
  data: {
    mode: "labeled_local_verifier_fixture",
    recorded_at: "2026-11-01T12:00:00Z",
    scenarios: 3,
    verification_success_rate: { numerator: 1, denominator: 3 },
    verdict_accuracy: { numerator: 3, denominator: 3 },
    false_positive_detection_rate: { numerator: 2, denominator: 2 },
    mean_verification_latency_ms: 200,
    model_calls: 0,
    results: [
      {
        scenario: "fixture_rejected_save",
        execution_status: "COMPLETED",
        actual_verdict: "VERIFIED_FAILURE",
        expected_verdict: "VERIFIED_FAILURE",
        latency_ms: 100,
        source_available: true,
      },
      {
        scenario: "fixture_wrong_record",
        execution_status: "COMPLETED",
        actual_verdict: "VERIFIED_FAILURE",
        expected_verdict: "VERIFIED_FAILURE",
        latency_ms: 200,
        source_available: true,
      },
      {
        scenario: "fixture_persisted_goal",
        execution_status: "COMPLETED",
        actual_verdict: "VERIFIED_SUCCESS",
        expected_verdict: "VERIFIED_SUCCESS",
        latency_ms: 300,
        source_available: true,
      },
    ],
  },
};
const policy: BenchmarkArtifact = {
  report_id: "planning-policy",
  filename: "fixture-policy.json",
  sha256: "b".repeat(64),
  evaluation_mode: "synthetic_policy_fixtures",
  limitations: ["Unit fixture, not executed tasks."],
  data: {
    mode: "synthetic_policy_fixtures",
    evaluated: 2,
    expected_outcome_match_rate: 1,
    schema_validity_rate: 0.5,
    unsupported_action_rate: 0.5,
    mean_latency_ms: 0.5,
    rows: [
      {
        id: "fixture_valid_plan",
        status: "valid",
        latency_ms: 0.2,
        expected_outcome_matched: true,
        schema_valid: true,
        grounding_valid: true,
        unsupported_action: false,
      },
      {
        id: "fixture_rejected_plan",
        status: "rejected",
        latency_ms: 0.8,
        expected_outcome_matched: true,
        schema_valid: false,
        grounding_valid: true,
        unsupported_action: true,
      },
    ],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(benchmarkApi.list).mockResolvedValue({
    items: [verification, policy],
    unavailable: [],
    comparative_evaluation_available: false,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
function workspace() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <BenchmarkPage />
    </QueryClientProvider>,
  );
}
async function ready() {
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Export report JSON" }),
    ).toBeEnabled(),
  );
}

it("shows report denominators and verifier timing without equating completion with goal success", async () => {
  workspace();
  await ready();
  const task = screen.getByRole("region", { name: "Verified task success" });
  expect(task).toHaveTextContent("33.3%");
  expect(task).toHaveTextContent("1 / 3 recorded cases");
  expect(
    screen.getByRole("region", { name: "Verification latency · mean" }),
  ).toHaveTextContent("200.0 ms");
  expect(
    screen.getByText(/task-success rate describes this fault mix/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Scenario results" }),
  ).toHaveTextContent("VERIFIED FAILURE");
  expect(
    screen.queryByRole("button", { name: /Run Benchmark Suite/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/99\.42%|SAM 3\.1|Claude 3\.5|GPT-4o/),
  ).not.toBeInTheDocument();
});
it("switches to policy-only metrics and keeps missing model calls unrecorded", async () => {
  workspace();
  await ready();
  fireEvent.change(screen.getByLabelText("Evaluation source"), {
    target: { value: "planning-policy" },
  });
  expect(
    screen.getByRole("region", { name: "Expected policy agreement" }),
  ).toHaveTextContent("100.0%");
  expect(
    screen.getByRole("region", { name: "Expected policy agreement" }),
  ).toHaveTextContent("2 synthetic fixtures · not task success");
  expect(
    screen.getByRole("region", { name: "Policy latency · mean" }),
  ).toHaveTextContent("0.500 ms");
  expect(
    screen.queryByRole("region", { name: "Verified task success" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Scenario results" }),
  ).toHaveTextContent("Policy fixture · not executed");
  expect(
    screen.getByRole("complementary", { name: "Evaluation coverage" }),
  ).toHaveTextContent("Selected report model callsNot recorded");
});
it("filters only source rows and supports selecting chart samples and archived records", async () => {
  workspace();
  await ready();
  fireEvent.change(screen.getByLabelText("Recorded outcome"), {
    target: { value: "VERIFIED_SUCCESS" },
  });
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  expect(
    screen.getByRole("region", { name: "Verified task success" }),
  ).toHaveTextContent("1 / 3 recorded cases");
  fireEvent.click(
    screen.getByRole("button", {
      name: "Inspect latency sample fixture_wrong_record",
    }),
  );
  expect(
    screen.getByRole("button", {
      name: "Inspect latency sample fixture_wrong_record",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByText("Selected scenario record: fixture wrong record"),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search benchmark scenarios"), {
    target: { value: "not-a-scenario" },
  });
  expect(
    screen.getByText("No scenarios match these filters."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("img", {
      name: "Recorded scenario latency in milliseconds",
    }),
  ).toBeInTheDocument();
});
it("withdraws cached reports, chart and exports when a refresh fails", async () => {
  workspace();
  await ready();
  vi.mocked(benchmarkApi.list).mockRejectedValue(
    new Error("Fixture report store offline"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh reports" }));
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("region", { name: "Recorded scenario latency" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Export report JSON" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Copy source hash" }),
  ).toBeDisabled();
  expect(screen.queryByText(verification.sha256)).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Verified task success" }),
  ).toHaveTextContent("Unavailable");
});
it("leaves empty and unavailable sources explicit", async () => {
  vi.mocked(benchmarkApi.list).mockResolvedValue({
    items: [],
    unavailable: ["verification", "planning-policy"],
    comparative_evaluation_available: false,
  });
  workspace();
  await screen.findByRole("heading", {
    name: "No benchmark evidence available",
  });
  expect(screen.getByRole("status")).toHaveTextContent(
    "Unavailable report sources: verification, planning-policy",
  );
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Export report JSON" }),
  ).toBeDisabled();
});
it("does not replace an explicitly chosen missing report with a different methodology", async () => {
  workspace();
  await ready();
  fireEvent.change(screen.getByLabelText("Evaluation source"), {
    target: { value: "verification" },
  });
  vi.mocked(benchmarkApi.list).mockResolvedValue({
    items: [policy],
    unavailable: ["verification"],
    comparative_evaluation_available: false,
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh reports" }));
  await screen.findByRole("heading", {
    name: "No benchmark evidence available",
  });
  expect(
    screen.getByRole("button", { name: "Export report JSON" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("region", { name: "Expected policy agreement" }),
  ).not.toBeInTheDocument();
});
it("exports the selected report with provenance and copies only the source fingerprint", async () => {
  workspace();
  await ready();
  fireEvent.change(screen.getByLabelText("Evaluation source"), {
    target: { value: "planning-policy" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export report JSON" }));
  expect(downloadTaskJson).toHaveBeenCalledWith(
    "inti-benchmark-planning-policy.json",
    policy,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy source hash" }));
  await screen.findByText("Source hash copied");
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(policy.sha256);
  expect(
    screen.getByText(/its bytes have a different hash/),
  ).toBeInTheDocument();
});
it("excludes invalid timing samples instead of drawing zero or invented latency", async () => {
  const bad = {
    ...verification,
    data: {
      ...verification.data,
      mean_verification_latency_ms: NaN,
      results: verification.data.results!.map((row) => ({
        ...row,
        latency_ms: -1,
      })),
    },
  };
  vi.mocked(benchmarkApi.list).mockResolvedValue({
    items: [bad],
    unavailable: [],
    comparative_evaluation_available: false,
  });
  workspace();
  await ready();
  expect(
    screen.getByText("No valid latency samples in this report."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("img", {
      name: "Recorded scenario latency in milliseconds",
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Verification latency · mean" }),
  ).toHaveTextContent("Unavailable");
});
