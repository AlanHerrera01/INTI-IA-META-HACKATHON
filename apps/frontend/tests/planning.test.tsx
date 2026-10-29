import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { PlanningPage } from "../src/pages/PlanningPage";
import { api } from "../src/services/api";
import { planningApi } from "../src/services/planningApi";
import type { PlanningResult } from "../src/types/planning";

vi.mock("../src/services/api", () => ({
  api: { observations: vi.fn(), observation: vi.fn(), model: vi.fn() },
  errorMessage: (e: Error) => e.message,
}));
vi.mock("../src/services/planningApi", () => ({
  planningApi: {
    list: vi.fn(),
    generate: vi.fn(),
    get: vi.fn(),
    events: vi.fn(),
    validate: vi.fn(),
    interpret: vi.fn(),
  },
}));
const observation = {
  id: "test-observation",
  timestamp: "2026-10-28T12:00:00Z",
  source: "browser",
  source_url: "http://localhost:8001/",
  page_title: "Synthetic inventory",
  width: 1440,
  height: 900,
  screenshot_url: "/test.png",
  analysis_status: "not_analyzed",
  analysis: null,
};
const result: PlanningResult = {
  plan: {
    id: "test-plan",
    task_id: "test-task",
    observation_id: observation.id,
    goal: "Find EQ-001",
    status: "requires_clarification",
    created_at: observation.timestamp,
    validation_results: [
      {
        code: "ambiguous_intent",
        message: "Desired status is unspecified",
        severity: "clarification",
        action_id: null,
      },
    ],
    model_metadata: [],
    actions: [
      {
        id: "inspect",
        action_type: "inspect",
        target: {
          element_id: "search",
          description: "Inspect search input",
          source: "model_visual",
          requires_observation: false,
        },
        parameters: {
          text: null,
          option: null,
          url: null,
          direction: null,
          amount: null,
          seconds: null,
          evidence: "Search control is visible",
        },
        preconditions: ["Inventory screenshot is available"],
        expected_postconditions: ["Search input identified"],
        explanation: "Read current UI state",
        risk_level: "LOW",
      },
    ],
  },
  scene: {
    id: "test-scene",
    observation_id: observation.id,
    viewport: { width: 1440, height: 900 },
    summary: "TEST FIXTURE visual scene",
    generated_at: observation.timestamp,
    captured_at: observation.timestamp,
    uncertainties: ["Desired status unknown"],
    model_usage: null,
    elements: [
      {
        id: "search",
        element_type: "input",
        label: "Search equipment",
        description: "Search control",
        source: "model_visual",
        visible: true,
        enabled: true,
        confidence_optional: 0.9,
        bounding_box: {
          x: 100,
          y: 150,
          width: 300,
          height: 45,
          coordinate_system: "pixels",
        },
      },
    ],
  },
  intent: {
    goal: "Find EQ-001",
    target_application: "Inventory",
    constraints: [],
    expected_outcome: "Asset identified",
    ambiguities: ["Desired status is unspecified"],
    explicit_requirements: ["Find EQ-001"],
    assumptions: [],
    unverified_inferences: [],
    model_usage: null,
  },
  assumptions: [],
  unresolved_ambiguities: ["Desired status is unspecified"],
  warnings: [],
  model_usage: [
    {
      model: "test-only-model",
      response_id: "test-response",
      input_tokens: 100,
      output_tokens: 30,
      retries: 0,
    },
  ],
  validation_summary: "requires_clarification: 1 finding",
  started_at: observation.timestamp,
  ended_at: "2026-10-28T12:00:01Z",
  correlation_id: "test-correlation",
};
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <PlanningPage />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(api.observations).mockResolvedValue([observation]);
  vi.mocked(api.observation).mockResolvedValue(observation);
  vi.mocked(api.model).mockResolvedValue({
    provider: "Meta",
    configured: true,
    available: null,
    model: "muse-spark-1.3",
    detail: "",
  });
  vi.mocked(planningApi.list).mockResolvedValue({
    items: [],
    total: 0,
    offset: 0,
    limit: 10,
  });
  vi.mocked(planningApi.events).mockResolvedValue([]);
});
it("shows task input and empty state without execution controls", async () => {
  mount();
  expect(
    screen.getByLabelText("Natural-language objective"),
  ).toBeInTheDocument();
  expect(
    await screen.findByText("No persisted plans yet."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Execute Plan/i }),
  ).not.toBeInTheDocument();
});
it("generates and renders a typed plan, overlays and warnings", async () => {
  vi.mocked(planningApi.generate).mockResolvedValue(result);
  mount();
  await screen.findByRole("option", { name: /Synthetic inventory/ });
  fireEvent.change(screen.getByLabelText("Natural-language objective"), {
    target: { value: "Find EQ-001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
  expect(
    await screen.findByRole("heading", { name: "Action plan" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Inspect search input")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Inspect Search equipment" }),
  ).toBeInTheDocument();
  expect(
    screen.getAllByText(/Desired status is unspecified/).length,
  ).toBeGreaterThan(0);
  expect(screen.getByText("test-only-model")).toBeInTheDocument();
});
it("displays model request error", async () => {
  vi.mocked(planningApi.generate).mockRejectedValue(
    new Error("Meta unavailable"),
  );
  mount();
  await screen.findByRole("option", { name: /Synthetic inventory/ });
  fireEvent.change(screen.getByLabelText("Natural-language objective"), {
    target: { value: "Find EQ-001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Meta unavailable",
  );
});
it("shows loading and prevents duplicate generation", async () => {
  vi.mocked(planningApi.generate).mockReturnValue(new Promise(() => {}));
  mount();
  await screen.findByRole("option", { name: /Synthetic inventory/ });
  fireEvent.change(screen.getByLabelText("Natural-language objective"), {
    target: { value: "Find EQ-001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Interpreting screenshot",
  );
  expect(screen.getByRole("button", { name: "Generate Plan" })).toBeDisabled();
});
it("explains missing credentials", async () => {
  vi.mocked(api.model).mockResolvedValue({
    provider: "Meta",
    configured: false,
    available: null,
    model: "muse-spark-1.3",
    detail: "",
  });
  mount();
  expect(await screen.findByText(/Meta is not configured/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Generate Plan" })).toBeDisabled();
});
