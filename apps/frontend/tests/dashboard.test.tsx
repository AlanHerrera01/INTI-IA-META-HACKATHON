import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "../src/pages/Dashboard";
import { api } from "../src/services/api";
import type { Observation } from "../src/types/api";

vi.mock("../src/services/api", () => ({
  api: {
    system: vi.fn(),
    model: vi.fn(),
    observations: vi.fn(),
    capture: vi.fn(),
  },
  errorMessage: (error: Error) => error.message,
}));
const observation: Observation = {
  id: "test-observation",
  timestamp: "2026-10-28T12:00:00Z",
  source: "browser",
  source_url: "http://localhost:8001/",
  page_title: "Inventory test fixture",
  width: 1440,
  height: 900,
  screenshot_url: "/api/v1/observations/test/screenshot",
  analysis_status: "not_analyzed",
  analysis: null,
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(api.system).mockResolvedValue({
    backend: true,
    database: true,
    browser: true,
    ready: true,
    version: "0.1.0",
  });
  vi.mocked(api.model).mockResolvedValue({
    configured: false,
    available: null,
    provider: "Meta",
    model: "muse-spark-1.3",
    detail: "No key",
  });
  vi.mocked(api.observations).mockResolvedValue([]);
});
describe("Observation dashboard", () => {
  it("renders empty state and real configuration status", async () => {
    mount();
    expect(
      screen.getByRole("heading", { name: /Observation console/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Your first observation starts here"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
  });
  it("shows loading state", () => {
    vi.mocked(api.observations).mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByText("Loading observations…")).toBeInTheDocument();
  });
  it("shows server error and retry", async () => {
    vi.mocked(api.observations).mockRejectedValue(
      new Error("Database unavailable"),
    );
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
  it("displays observation metadata and disables unconfigured model", async () => {
    vi.mocked(api.observations).mockResolvedValue([observation]);
    mount();
    expect(
      await screen.findByAltText("Captured Inventory test fixture"),
    ).toHaveAttribute("src", observation.screenshot_url);
    expect(screen.getByText("1440 × 900")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Analyze with Meta" }),
    ).toBeDisabled();
  });
  it("captures and refreshes the observation", async () => {
    vi.mocked(api.capture).mockResolvedValue(observation);
    mount();
    await screen.findByText("Your first observation starts here");
    vi.mocked(api.observations).mockResolvedValue([observation]);
    fireEvent.click(
      screen.getByRole("button", { name: "Capture observation" }),
    );
    await waitFor(() => expect(api.capture).toHaveBeenCalled());
    expect(
      await screen.findByAltText("Captured Inventory test fixture"),
    ).toBeInTheDocument();
  });
});
