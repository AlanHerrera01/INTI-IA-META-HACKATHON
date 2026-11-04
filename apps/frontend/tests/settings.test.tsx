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
import { SystemPage } from "../src/pages/SystemPage";
import { OperatorProvider } from "../src/app/OperatorContext";
import { useOperator } from "../src/hooks/useOperator";
import { api } from "../src/services/api";
import { inventoryApi } from "../src/services/inventoryApi";
import { downloadTaskJson } from "../src/features/tasks/records";
import type { ModelStatus } from "../src/types/api";

vi.mock("../src/services/api", () => ({
  api: { model: vi.fn(), system: vi.fn(), capabilities: vi.fn() },
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));
vi.mock("../src/services/inventoryApi", () => ({
  inventoryApi: { list: vi.fn() },
}));
vi.mock("../src/features/tasks/records", () => ({ downloadTaskJson: vi.fn() }));
const model: ModelStatus = {
  provider: "Meta",
  configured: false,
  available: null,
  model: "fixture-model",
  detail: "Unit fixture. Model key is absent.",
};
const flags = {
  model_calls_enabled: false,
  execution_enabled: true,
  verification_enabled: true,
  recovery_enabled: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.model).mockResolvedValue(model);
  vi.mocked(api.system).mockResolvedValue({
    backend: true,
    browser: true,
    database: true,
    ready: true,
    version: "fixture-version",
  });
  vi.mocked(api.capabilities).mockResolvedValue(flags);
  vi.mocked(inventoryApi.list).mockResolvedValue([
    {
      id: "fixture-asset",
      name: "Unit fixture asset",
      location: "Fixture lab",
      status: "Available",
      version: 1,
    },
  ]);
});
function AccessProbe() {
  const { token } = useOperator();
  return (
    <output aria-label="Shared access probe">
      {token ? "loaded" : "empty"}
    </output>
  );
}
function workspace() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <OperatorProvider>
          <SystemPage />
          <AccessProbe />
        </OperatorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function ready() {
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Export diagnostics" }),
    ).toBeEnabled(),
  );
}

it("shows actual server configuration without an identity or save operation", async () => {
  workspace();
  await ready();
  expect(
    screen.getByRole("region", {
      name: "AI vision and grounding configuration",
    }),
  ).toHaveTextContent("fixture-model");
  expect(
    screen.getByRole("region", {
      name: "AI vision and grounding configuration",
    }),
  ).toHaveTextContent("Not configured");
  expect(screen.getByText("Not measured")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /save changes|halt now|rotate key/i }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByText(/ALAN VHA|99\.84%|H100/)).not.toBeInTheDocument();
});
it.each([
  [null, "Not established"],
  [true, "Last analysis succeeded"],
  [false, "Last analysis failed"],
] as const)(
  "separates last analysis %s from backend readiness and model permission",
  async (available, expected) => {
    vi.mocked(api.model).mockResolvedValue({
      ...model,
      configured: true,
      available,
    });
    workspace();
    await ready();
    expect(
      screen.getByRole("region", {
        name: "AI vision and grounding configuration",
      }),
    ).toHaveTextContent(expected);
    expect(screen.getByLabelText("Server feature switches")).toHaveTextContent(
      "Task model requestsModel-based tasks also require a configured Meta adapter.Disabled",
    );
    expect(
      screen.getByText("Ready", { selector: ".settings-service-summary span" }),
    ).toBeInTheDocument();
  },
);
it("filters real modules and returns to the full desktop workspace", async () => {
  workspace();
  await ready();
  const modules = [
    ["General & Access", "Local operator access"],
    ["Vision & AI Models", "AI vision and grounding configuration"],
    ["Connected Apps", "Connected applications"],
    ["Sandbox & Services", "Sandbox services and API configuration"],
  ];
  for (const [label, region] of modules) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: label })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: region })).toBeInTheDocument();
    for (const [, other] of modules)
      if (other !== region)
        expect(
          screen.queryByRole("region", { name: other }),
        ).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole("button", { name: "All Modules" }));
  for (const [, region] of modules)
    expect(screen.getByRole("region", { name: region })).toBeInTheDocument();
});
it("shares a capability in memory, clears the input and disconnects without browser storage", async () => {
  const local = vi.spyOn(Storage.prototype, "setItem");
  workspace();
  await ready();
  const input = screen.getByLabelText("Operator capability");
  expect(input).toHaveAttribute("type", "password");
  expect(
    screen.getByRole("button", { name: "Load capability" }),
  ).toBeDisabled();
  fireEvent.change(input, {
    target: { value: "  fixture-capability-memory-only  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Load capability" }));
  expect(input).toHaveValue("");
  expect(screen.getByLabelText("Shared access probe")).toHaveTextContent(
    "loaded",
  );
  expect(screen.getByText("CAPABILITY LOADED")).toBeInTheDocument();
  expect(local).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Vision & AI Models" }));
  fireEvent.click(screen.getByRole("button", { name: "General & Access" }));
  expect(screen.getByText("CAPABILITY LOADED")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  expect(screen.getByLabelText("Shared access probe")).toHaveTextContent(
    "empty",
  );
  expect(screen.getByRole("button", { name: "Disconnect" })).toBeDisabled();
});
it("does not retain capability access in a new workspace provider", async () => {
  const mounted = workspace();
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "fixture-transient-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Load capability" }));
  expect(screen.getByLabelText("Shared access probe")).toHaveTextContent(
    "loaded",
  );
  mounted.unmount();
  workspace();
  expect(screen.getByLabelText("Shared access probe")).toHaveTextContent(
    "empty",
  );
  expect(screen.getByText("NOT CONNECTED")).toBeInTheDocument();
});
it("exports only explicit public diagnostic fields, excluding capability, draft and unknown fields", async () => {
  vi.mocked(api.model).mockResolvedValue({
    ...model,
    private_key: "fixture-server-secret",
  } as ModelStatus);
  workspace();
  await ready();
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "fixture-loaded-secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Load capability" }));
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "fixture-draft-secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export diagnostics" }));
  expect(downloadTaskJson).toHaveBeenCalledWith(
    "inti-settings-diagnostics.json",
    expect.objectContaining({
      model: {
        provider: "Meta",
        configured: false,
        available: null,
        model: "fixture-model",
      },
      capabilities: flags,
      inventory: { reachable: true, record_count: 1 },
    }),
  );
  const serialized = JSON.stringify(vi.mocked(downloadTaskJson).mock.calls[0]);
  expect(serialized).not.toMatch(
    /fixture-loaded-secret|fixture-draft-secret|fixture-server-secret|fixture-asset/,
  );
});
it("withdraws cached diagnostics and export after sources fail to refresh", async () => {
  workspace();
  await ready();
  for (const method of [
    api.model,
    api.system,
    api.capabilities,
    inventoryApi.list,
  ])
    vi.mocked(method).mockRejectedValue(new Error("Fixture source offline"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh diagnostics" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(screen.queryByText("fixture-model")).not.toBeInTheDocument(),
  );
  expect(screen.queryByText("fixture-version")).not.toBeInTheDocument();
  expect(screen.queryByText("Reachable")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Export diagnostics" }),
  ).toBeDisabled();
  expect(
    screen.getByLabelText("Server feature switches"),
  ).not.toHaveTextContent("Enabled");
});
it("checks the inventory connection independently and withdraws its cached asset count on failure", async () => {
  workspace();
  await ready();
  vi.mocked(inventoryApi.list).mockRejectedValue(
    new Error("Fixture inventory unavailable"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  await screen.findByRole("alert");
  const apps = screen.getByRole("region", { name: "Connected applications" });
  expect(apps).toHaveTextContent("Unavailable");
  expect(apps).toHaveTextContent("Stored assetsUnknown");
  expect(api.model).toHaveBeenCalledTimes(1);
  expect(api.capabilities).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Export diagnostics" }),
  ).toBeDisabled();
});
it("treats an empty reachable inventory as zero records and links to scoped execution controls", async () => {
  vi.mocked(inventoryApi.list).mockResolvedValue([]);
  workspace();
  await ready();
  const apps = screen.getByRole("region", { name: "Connected applications" });
  expect(apps).toHaveTextContent("Stored assets0");
  expect(within(apps).getByText("Reachable")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open execution controls" }),
  ).toHaveAttribute("href", "/execution");
  expect(
    screen.getByRole("link", { name: "Review AI Models" }),
  ).toHaveAttribute("href", "/models");
});
