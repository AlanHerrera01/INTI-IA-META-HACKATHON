import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { ModelsPage } from "../src/pages/ModelsPage";
import { api } from "../src/services/api";
import type { ModelStatus, Observation } from "../src/types/api";

vi.mock("../src/services/api", () => ({
  api: {
    model: vi.fn(),
    system: vi.fn(),
    capabilities: vi.fn(),
    observations: vi.fn(),
  },
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

const model: ModelStatus = {
  provider: "Meta",
  model: "fixture-model-id",
  configured: false,
  available: null,
  detail: "Labeled unit fixture. No inference request.",
};
const flags = {
  model_calls_enabled: false,
  execution_enabled: true,
  verification_enabled: true,
  recovery_enabled: false,
};
const observation: Observation = {
  id: "fixture-observation",
  timestamp: "2026-11-01T12:00:00Z",
  source: "unit-fixture",
  source_url: "http://localhost:8001/",
  page_title: "Fixture inventory",
  width: 1366,
  height: 900,
  screenshot_url: "/fixture-screenshot.png",
  analysis_status: "not_requested",
  analysis: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.model).mockResolvedValue(model);
  vi.mocked(api.system).mockResolvedValue({
    backend: true,
    database: true,
    browser: true,
    ready: true,
    version: "fixture-version",
  });
  vi.mocked(api.capabilities).mockResolvedValue(flags);
  vi.mocked(api.observations).mockResolvedValue([observation]);
});
function workspace() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <ModelsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("shows the configured identifier without inferring an active model connection", async () => {
  workspace();
  await screen.findByRole("heading", { name: "fixture-model-id" });
  expect(
    screen.getByText("Blocked · model not configured"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Model connection")).toHaveTextContent(
    "Not configured",
  );
  expect(screen.getByLabelText("Model connection")).toHaveTextContent(
    "Not established",
  );
  expect(
    screen.queryByText("Allowed by configuration"),
  ).not.toBeInTheDocument();
});
it("keeps an untested provider distinct from a configured, permitted adapter", async () => {
  vi.mocked(api.model).mockResolvedValue({ ...model, configured: true });
  vi.mocked(api.capabilities).mockResolvedValue({
    ...flags,
    model_calls_enabled: true,
  });
  workspace();
  await screen.findByText("Allowed by configuration");
  expect(screen.getByLabelText("Model connection")).toHaveTextContent(
    "Not established",
  );
  expect(screen.queryByText("Last analysis succeeded")).not.toBeInTheDocument();
});
it("reports a failed last analysis without describing the provider as connected", async () => {
  vi.mocked(api.model).mockResolvedValue({
    ...model,
    configured: true,
    available: false,
  });
  vi.mocked(api.capabilities).mockResolvedValue({
    ...flags,
    model_calls_enabled: true,
  });
  workspace();
  await screen.findByText("Allowed by configuration");
  expect(screen.getByLabelText("Model connection")).toHaveTextContent(
    "Last analysis failed",
  );
  expect(screen.getByLabelText("Model connection")).not.toHaveTextContent(
    "Last analysis succeeded",
  );
});
it("respects disabled calls even when a previous real analysis succeeded", async () => {
  vi.mocked(api.model).mockResolvedValue({
    ...model,
    configured: true,
    available: true,
  });
  workspace();
  await screen.findByText("Blocked · calls disabled");
  expect(screen.getByLabelText("Model connection")).toHaveTextContent(
    "Last analysis succeeded",
  );
  expect(screen.getByLabelText("Model connection")).toHaveTextContent(
    "Disabled",
  );
});
it("withdraws cached model, policy, environment and observation data on refresh failures", async () => {
  vi.mocked(api.model).mockResolvedValue({
    ...model,
    configured: true,
    available: true,
  });
  vi.mocked(api.capabilities).mockResolvedValue({
    ...flags,
    model_calls_enabled: true,
  });
  workspace();
  await screen.findByText("Allowed by configuration");
  await screen.findByAltText("Recorded input: Fixture inventory");
  for (const method of [
    api.model,
    api.system,
    api.capabilities,
    api.observations,
  ])
    vi.mocked(method).mockRejectedValue(
      new Error("Fixture diagnostics offline"),
    );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Refresh diagnostics" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh diagnostics" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "fixture-model-id" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByText("Allowed by configuration"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByAltText("Recorded input: Fixture inventory"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("fixture-version")).not.toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Model routing and permissions" }),
    ).getAllByText("Unknown"),
  ).toHaveLength(4);
});
it("leaves unsupported performance and hardware measurements unavailable", async () => {
  workspace();
  await screen.findByRole("heading", { name: "fixture-model-id" });
  expect(screen.getAllByText("Not measured")).toHaveLength(4);
  expect(
    screen.queryByText(/H100|99\.84%|SAM 3\.1|60 FPS/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Runtime environment" }),
  ).toHaveTextContent("GPU / VRAM telemetryUnavailable");
});
it("does not replace missing observations with an illustrative frame", async () => {
  vi.mocked(api.observations).mockResolvedValue([]);
  workspace();
  await screen.findByText("No saved public observations");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Inspect observation" }),
  ).toHaveAttribute("href", "/observations");
});
it("labels saved frames and hides a failed image", async () => {
  workspace();
  const image = await screen.findByAltText("Recorded input: Fixture inventory");
  expect(
    screen.getByText("RECORDED CAPTURE / NOT A LIVE STREAM"),
  ).toBeInTheDocument();
  expect(screen.getByText("1366 × 900")).toBeInTheDocument();
  fireEvent.error(image);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Saved screenshot unavailable",
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("opens local configuration guidance without a credential form or model registry", async () => {
  workspace();
  await screen.findByRole("heading", { name: "fixture-model-id" });
  fireEvent.click(screen.getByRole("button", { name: "Configuration guide" }));
  expect(
    screen.getByRole("region", { name: "Model configuration guide" }),
  ).toHaveTextContent("META_MODEL_ID");
  expect(
    screen.getByRole("button", { name: "Configuration guide" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute(
    "href",
    "/system",
  );
  expect(screen.getByRole("link", { name: "View benchmarks" })).toHaveAttribute(
    "href",
    "/benchmarks",
  );
});
it("keeps server permission switches distinct from dependency availability", async () => {
  vi.mocked(api.system).mockResolvedValue({
    backend: true,
    database: true,
    browser: false,
    ready: false,
    version: "fixture-version",
  });
  workspace();
  await screen.findByText("fixture-version");
  const execution = screen.getByRole("article", {
    name: "Browser execution runtime",
  });
  expect(execution).toHaveTextContent("Browser dependencyUnavailable");
  expect(execution).toHaveTextContent("Execution policyEnabled");
  expect(
    screen.getByRole("link", { name: "Open Live Execution" }),
  ).toHaveAttribute("href", "/execution");
});
