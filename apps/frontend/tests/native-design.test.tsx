import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  NativeDesignedPage,
  type NativeView,
} from "../src/pages/NativeDesignedPage";
import { OperatorProvider } from "../src/app/OperatorContext";
import { api } from "../src/services/api";
import {
  computerApi,
  type ComputerState,
  type ComputerTask,
} from "../src/services/computerApi";

vi.mock("../src/services/computerApi", () => ({
  computerApi: {
    state: vi.fn(),
    applications: vi.fn(),
    prepare: vi.fn(),
    approve: vi.fn(),
    cancel: vi.fn(),
    pairing: vi.fn(),
    revoke: vi.fn(),
    permitApplication: vi.fn(),
    prepareApplication: vi.fn(),
  },
}));
const measurements = vi.hoisted(() => ({
  attempts: 1,
  successful_calls: 1,
  failed_calls: 0,
  mean_latency_ms: 1250,
  output_tokens_per_second: 12.5,
  token_samples: 1,
  grounding_samples: 1,
  grounding_hit_rate: 1,
  last_at: 100,
  last_ok: true,
  last_http_status: null,
  gpu_memory_bytes: null,
  window_limit: 200,
}));
const modelConfiguration = vi.hoisted(() => ({ configured: false }));
vi.mock("../src/hooks/useSystem", () => ({
  useModel: () => ({
    data: {
      provider: "Meta",
      model: "fixture-model",
      configured: modelConfiguration.configured,
      available: null,
      measurements,
    },
    refetch: vi.fn(),
  }),
  useSystem: () => ({
    data: {
      backend: true,
      database: true,
      browser: false,
      ready: true,
      version: "fixture-version",
    },
    refetch: vi.fn(),
  }),
}));
const task: ComputerTask = {
  id: "11111111-1111-4111-8111-111111111111",
  device_id: "fixture-device",
  status: "DRAFT",
  digest: "a".repeat(64),
  created_at: 1,
  updated_at: 2,
  plan: {
    id: "11111111-1111-4111-8111-111111111111",
    device_id: "fixture-device",
    authorized_root: "C:\\Fixture",
    filename: "fixture.txt",
    content: "Fixture local contents",
    url: "https://example.com",
    source: "authored_local_sample",
  },
  steps: [
    {
      id: "write_file",
      action: "Create a new text file",
      target: "fixture.txt",
    },
    {
      id: "open_notepad",
      action: "Request Notepad to open that file",
      target: "fixture.txt",
    },
    {
      id: "open_browser",
      action: "Request the default browser to open the approved URL",
      target: "https://example.com",
    },
  ],
  result: null,
};
let state: ComputerState;
beforeEach(() => {
  vi.clearAllMocks();
  modelConfiguration.configured = false;
  state = {
    devices: [
      {
        id: "fixture-device",
        name: "Fixture paired PC",
        platform: "win32",
        root: "C:\\Fixture",
        last_seen: Date.now() / 1000,
        revoked: 0,
      },
    ],
    tasks: [task],
    model_calls: 0,
    planning_mode: "authored_local_sample",
  };
  vi.mocked(computerApi.state).mockImplementation(async () => state);
  vi.mocked(computerApi.applications).mockResolvedValue({
    applications: [],
    scanned_at: Date.now() / 1000,
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => vi.restoreAllMocks());
function mount(view: NativeView) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OperatorProvider>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<NativeDesignedPage view={view} />} />
            <Route
              path="/planning"
              element={<p>Fresh draft requires approval</p>}
            />
          </Routes>
        </MemoryRouter>
      </OperatorProvider>
    </QueryClientProvider>,
  );
}
async function connect() {
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "fixture-local-token" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(computerApi.state).toHaveBeenCalled());
}

it("shows measured model values and synthetic scope without claiming hosted GPU telemetry", async () => {
  mount("models");
  expect(screen.getByText("12.50 tok/s")).toBeInTheDocument();
  expect(screen.getByText("1250 ms")).toBeInTheDocument();
  expect(screen.getByText("100.0%")).toBeInTheDocument();
  expect(screen.getByText("Not exposed")).toBeInTheDocument();
  expect(
    screen.getByText(/Point inside target on synthetic/),
  ).toBeInTheDocument();
  const send = vi.spyOn(api, "evaluateModel");
  expect(
    screen.getByRole("button", { name: "Run one real calibration" }),
  ).toBeDisabled();
  expect(send).not.toHaveBeenCalled();
});

it("submits one calibration only after explicit confirmation", async () => {
  modelConfiguration.configured = true;
  const send = vi.spyOn(api, "evaluateModel").mockResolvedValue({
    provider: "Meta",
    configured: true,
    available: true,
    model: "fixture-model",
    detail: "fixture",
  });
  const confirm = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  mount("models");
  await connect();
  const button = screen.getByRole("button", {
    name: "Run one real calibration",
  });
  fireEvent.click(button);
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() =>
    expect(send).toHaveBeenCalledExactlyOnceWith("fixture-local-token"),
  );
  expect(confirm).toHaveBeenCalledTimes(2);
});

it("keeps the selected computer and application permissions synchronized without authorizing a launch", async () => {
  state.devices.push({
    ...state.devices[0],
    id: "second-device",
    name: "Second PC",
    root: "C:\\Second",
  });
  const { container } = mount("hardware");
  await connect();
  expect(
    screen.getByRole("heading", { name: "Computers & Applications" }),
  ).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: /Second PC/ }));
  await waitFor(() =>
    expect(screen.getByLabelText("Application computer")).toHaveValue(
      "second-device",
    ),
  );
  expect(container.querySelector(".native-workspace-path")).toHaveTextContent(
    "C:\\Second",
  );
  expect(computerApi.applications).toHaveBeenCalledWith(
    "fixture-local-token",
    "second-device",
  );
  expect(computerApi.permitApplication).not.toHaveBeenCalled();
  expect(computerApi.prepareApplication).not.toHaveBeenCalled();
  expect(computerApi.approve).not.toHaveBeenCalled();
});

it("restores Overview's four metrics, pipeline, capture panel and separate runtime column", async () => {
  const { container } = mount("overview");
  await connect();
  expect(
    container.querySelectorAll(".overview-stat-grid > section"),
  ).toHaveLength(4);
  expect(container.querySelectorAll(".overview-loop-step")).toHaveLength(4);
  expect(
    container.querySelector(".overview-primary .native-design-frame"),
  ).toBeInTheDocument();
  expect(
    container.querySelector(".overview-secondary .overview-runtime-row"),
  ).toBeInTheDocument();
  expect(container.querySelector(".native-design-frame img")).toBeNull();
  expect(container.querySelector(".local-workflow")).toBeNull();
  expect(computerApi.approve).not.toHaveBeenCalled();
});

it("keeps task preparation and exact approval functional inside the restored Studio", async () => {
  const prepared: ComputerTask = {
    ...task,
    id: "22222222-2222-4222-8222-222222222222",
    digest: "b".repeat(64),
    plan: {
      ...task.plan,
      id: "22222222-2222-4222-8222-222222222222",
      content: "My reviewed local text",
    },
  } as ComputerTask;
  vi.mocked(computerApi.prepare).mockImplementation(async () => {
    state = { ...state, tasks: [prepared, ...state.tasks] };
    return prepared;
  });
  vi.mocked(computerApi.approve).mockResolvedValue({
    ...prepared,
    status: "QUEUED",
  });
  const { container } = mount("planning");
  await connect();
  fireEvent.change(screen.getByLabelText("File contents"), {
    target: { value: "My reviewed local text" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare plan" }));
  await waitFor(() =>
    expect(computerApi.prepare).toHaveBeenCalledWith(
      "fixture-local-token",
      expect.objectContaining({ content: "My reviewed local text" }),
    ),
  );
  expect(computerApi.approve).not.toHaveBeenCalled();
  expect(
    container.querySelector(".studio-layout .studio-aside"),
  ).toBeInTheDocument();
  fireEvent.click(
    await screen.findByRole("button", { name: "Review & execute" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("My reviewed local text");
  expect(dialog).toHaveTextContent(prepared.digest);
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "Approve & run on this computer",
    }),
  );
  await waitFor(() =>
    expect(computerApi.approve).toHaveBeenCalledWith(
      "fixture-local-token",
      prepared.id,
      prepared.digest,
    ),
  );
});

it("shows distinct stream, capture, controls and inspector columns for native execution", async () => {
  const { container } = mount("execution");
  await connect();
  expect(
    container.querySelector(".live-left-column .native-stream"),
  ).toBeInTheDocument();
  expect(
    container.querySelector(".live-center-column .native-design-frame"),
  ).toBeInTheDocument();
  expect(container.querySelector(".live-right-column")).toBeInTheDocument();
  expect(
    await screen.findByRole("button", { name: "Review & execute" }),
  ).toBeInTheDocument();
  expect(computerApi.approve).not.toHaveBeenCalled();
});

it("prepares a fresh reviewed draft from recovery without replaying an interrupted action", async () => {
  state = {
    ...state,
    tasks: [
      {
        ...task,
        status: "INTERRUPTED",
        result: { ok: false, steps: [], error: "Fixture interrupted" },
      },
    ],
  };
  vi.mocked(computerApi.prepare).mockResolvedValue({
    ...task,
    id: "fresh-draft",
  });
  mount("recovery");
  await connect();
  const button = await screen.findByRole("button", {
    name: "Prepare a new reviewed draft",
  });
  vi.spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  fireEvent.click(button);
  expect(computerApi.prepare).not.toHaveBeenCalled();
  fireEvent.click(button);
  await screen.findByText("Fresh draft requires approval");
  expect(computerApi.approve).not.toHaveBeenCalled();
  expect(computerApi.prepare).toHaveBeenCalledWith(
    "fixture-local-token",
    expect.objectContaining({
      filename: "fixture.txt",
      content: "Fixture local contents",
    }),
  );
});
