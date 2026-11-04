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
import { VisualObservations } from "../src/pages/VisualObservations";
import { percentBounds } from "../src/features/observations/bounds";
import { OperatorContext } from "../src/hooks/useOperator";
import { api } from "../src/services/api";
import { planningApi } from "../src/services/planningApi";
import { executionApi } from "../src/services/executionApi";
import type { Observation } from "../src/types/api";
import type {
  PlanningResult,
  VisualElement,
  VisualScene,
} from "../src/types/planning";

vi.mock("../src/services/api", () => ({
  api: {
    observations: vi.fn(),
    observation: vi.fn(),
    capture: vi.fn(),
    analyze: vi.fn(),
    model: vi.fn(),
    capabilities: vi.fn(),
  },
  errorMessage: (error: Error) => error.message,
}));
vi.mock("../src/services/planningApi", () => ({
  planningApi: { list: vi.fn() },
}));
vi.mock("../src/services/executionApi", () => ({
  executionApi: { screenshot: vi.fn() },
}));
const frame: Observation = {
  id: "frame-unit-fixture",
  timestamp: "2026-10-30T12:00:00Z",
  source: "browser",
  source_url: "http://demo:8001/",
  page_title: "Inventory unit fixture",
  width: 1000,
  height: 500,
  screenshot_url: "/unit-fixture.png",
  analysis: null,
  analysis_status: "not_analyzed",
};
const element: VisualElement = {
  id: "search-fixture",
  label: "Search assets",
  element_type: "input",
  description: "Unit fixture target",
  bounding_box: {
    x: 100,
    y: 50,
    width: 300,
    height: 50,
    coordinate_system: "pixels",
  },
  visible: true,
  enabled: true,
  source: "dom_assisted",
  confidence_optional: null,
};
const scene: VisualScene = {
  id: "scene-fixture",
  observation_id: frame.id,
  viewport: { width: 1000, height: 500 },
  elements: [element],
  summary: "Authored unit fixture scene",
  uncertainties: [],
  generated_at: frame.timestamp,
  captured_at: frame.timestamp,
  model_usage: null,
};
const savedPlan = {
  plan: { id: "plan-fixture", observation_id: frame.id },
  scene,
} as PlanningResult;
function mount(entry = "/observations", token = "") {
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
      <OperatorContext.Provider
        value={{ token, setToken: vi.fn(), notice: "", notify: vi.fn() }}
      >
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/observations" element={<VisualObservations />} />
            <Route path="/observations/:id" element={<VisualObservations />} />
          </Routes>
        </MemoryRouter>
      </OperatorContext.Provider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.observations).mockResolvedValue([frame]);
  vi.mocked(api.observation).mockResolvedValue(frame);
  vi.mocked(api.model).mockResolvedValue({
    configured: true,
    available: true,
    provider: "Meta",
    model: "fixture-model",
    detail: "Unit fixture",
  });
  vi.mocked(api.capabilities).mockResolvedValue({
    model_calls_enabled: false,
    execution_enabled: true,
    verification_enabled: true,
    recovery_enabled: true,
  });
  vi.mocked(planningApi.list).mockResolvedValue({
    items: [savedPlan],
    total: 1,
    offset: 0,
    limit: 10,
  });
});

it("scales pixel and normalized bounds only for the matching capture and viewport", () => {
  expect(percentBounds(element, scene, frame)).toEqual({
    left: "10%",
    top: "10%",
    width: "30%",
    height: "10%",
  });
  expect(
    percentBounds(
      {
        ...element,
        bounding_box: {
          x: 100,
          y: 100,
          width: 300,
          height: 100,
          coordinate_system: "normalized_1000",
        },
      },
      scene,
      frame,
    ),
  ).toEqual({ left: "10%", top: "10%", width: "30%", height: "10%" });
  expect(
    percentBounds(
      element,
      { ...scene, observation_id: "another-frame" },
      frame,
    ),
  ).toBeNull();
  expect(
    percentBounds(
      element,
      { ...scene, viewport: { width: 800, height: 500 } },
      frame,
    ),
  ).toBeNull();
  expect(
    percentBounds(
      { ...element, bounding_box: { ...element.bounding_box!, x: 900 } },
      scene,
      frame,
    ),
  ).toBeNull();
  expect(
    percentBounds({ ...element, visible: false }, scene, frame),
  ).toBeNull();
});
it("inspects recorded bounds and toggles the raw frame without initiating model calls", async () => {
  mount();
  const target = await screen.findByRole("button", {
    name: "Inspect target Search assets",
  });
  fireEvent.click(target);
  const list = within(
    screen.getByRole("region", { name: "Recorded UI elements" }),
  );
  expect(list.getByRole("button", { name: /Search assets/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Raw Frame" }));
  expect(
    screen.queryByRole("button", { name: "Inspect target Search assets" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Model interpretation"));
  expect(
    screen.getByRole("button", { name: "Analyze with Meta" }),
  ).toBeDisabled();
  expect(api.analyze).not.toHaveBeenCalled();
  expect(screen.getByText("FPS and latency not measured")).toBeInTheDocument();
});
it("filters the gallery and selects another capture without changing the source frame", async () => {
  const second = {
    ...frame,
    id: "second-unit-fixture",
    page_title: "Another fixture",
    timestamp: "2026-10-29T12:00:00Z",
  };
  vi.mocked(api.observations).mockResolvedValue([frame, second]);
  mount();
  await screen.findByRole("button", { name: `View observation ${second.id}` });
  fireEvent.change(screen.getByLabelText("Search observations"), {
    target: { value: "Another" },
  });
  expect(
    screen.queryByRole("button", { name: `View observation ${frame.id}` }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: `View observation ${second.id}` }),
  );
  expect(
    await screen.findByAltText("Captured Another fixture"),
  ).toHaveAttribute("src", second.screenshot_url);
  expect(
    screen.queryByRole("button", { name: "Inspect target Search assets" }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search observations"), {
    target: { value: "no-such-capture" },
  });
  expect(
    screen.getByText("No observations match these filters."),
  ).toBeInTheDocument();
});
it("does not substitute a public frame when a direct protected observation is denied", async () => {
  vi.mocked(api.observation).mockRejectedValue(new Error("Operator required"));
  mount("/observations/private-fixture");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Operator required",
  );
  expect(
    screen.queryByAltText("Captured Inventory unit fixture"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Connect your local operator/ }),
  ).toBeInTheDocument();
});
it("loads public direct captures outside the recent list without requiring operator credentials", async () => {
  vi.mocked(api.observation).mockResolvedValue({
    ...frame,
    id: "older-public-fixture",
  });
  mount("/observations/older-public-fixture");
  expect(
    await screen.findByAltText("Captured Inventory unit fixture"),
  ).toHaveAttribute("src", frame.screenshot_url);
  expect(executionApi.screenshot).not.toHaveBeenCalled();
});
it("loads protected plan evidence with the operator capability and revokes temporary image URLs", async () => {
  const protectedFrame = {
    ...frame,
    id: "private-fixture",
    page_title: "Protected unit fixture",
    timestamp: "2026-10-30T13:00:00Z",
  };
  vi.mocked(planningApi.list).mockResolvedValue({
    items: [
      {
        ...savedPlan,
        plan: { ...savedPlan.plan, observation_id: protectedFrame.id },
        scene: { ...scene, observation_id: protectedFrame.id },
      },
    ],
    total: 1,
    offset: 0,
    limit: 10,
  });
  vi.mocked(api.observation).mockResolvedValue(protectedFrame);
  vi.mocked(executionApi.screenshot).mockResolvedValue(
    new Blob(["unit fixture image"]),
  );
  const create = vi.fn(() => "blob:unit-fixture");
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }),
  );
  const view = mount(
    "/observations?observation=private-fixture",
    "fixture-capability",
  );
  expect(
    await screen.findByAltText("Captured Protected unit fixture"),
  ).toHaveAttribute("src", "blob:unit-fixture");
  expect(api.observation).toHaveBeenCalledWith(
    protectedFrame.id,
    "fixture-capability",
  );
  expect(executionApi.screenshot).toHaveBeenCalledWith(
    protectedFrame.id,
    "fixture-capability",
  );
  expect(
    screen.getByRole("link", { name: "Export Frame" }),
  ).not.toHaveAttribute("href", expect.stringContaining("fixture-capability"));
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:unit-fixture");
});
it("renders empty and retry states instead of invented observations", async () => {
  vi.mocked(api.observations).mockRejectedValue(
    new Error("Capture storage unavailable"),
  );
  const view = mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Capture storage unavailable",
  );
  vi.mocked(api.observations).mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("heading", { name: "No observations yet" }),
  ).toBeInTheDocument();
  view.unmount();
});
it("captures only on an explicit click and selects the newly returned record", async () => {
  vi.mocked(api.capture).mockResolvedValue({
    ...frame,
    id: "new-unit-fixture",
    page_title: "New unit fixture",
  });
  mount();
  await screen.findByAltText("Captured Inventory unit fixture");
  expect(api.capture).not.toHaveBeenCalled();
  vi.mocked(api.observations).mockResolvedValue([
    { ...frame, id: "new-unit-fixture", page_title: "New unit fixture" },
    frame,
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Capture observation" }));
  await waitFor(() => expect(api.capture).toHaveBeenCalledTimes(1));
  expect(
    await screen.findByAltText("Captured New unit fixture"),
  ).toBeInTheDocument();
});
