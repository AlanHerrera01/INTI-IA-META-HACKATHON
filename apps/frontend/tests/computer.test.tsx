import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { ComputerPage } from "../src/pages/ComputerPage";
import { OperatorProvider } from "../src/app/OperatorContext";
import { LocaleProvider } from "../src/i18n/LocaleProvider";
import { LanguageSelector } from "../src/i18n/LanguageSelector";
import {
  computerApi,
  type ComputerState,
  type ComputerTask,
} from "../src/services/computerApi";

vi.mock("../src/services/computerApi", () => ({
  computerApi: {
    state: vi.fn(),
    prepare: vi.fn(),
    approve: vi.fn(),
    cancel: vi.fn(),
    pairing: vi.fn(),
    revoke: vi.fn(),
    applications: vi.fn(),
    permitApplication: vi.fn(),
    prepareApplication: vi.fn(),
  },
}));
const task: ComputerTask = {
  id: "fixture-task",
  device_id: "fixture-device",
  status: "DRAFT",
  digest: "a".repeat(64),
  created_at: Date.now() / 1000,
  updated_at: Date.now() / 1000,
  plan: {
    id: "fixture-task",
    device_id: "fixture-device",
    authorized_root: "C:\\fixture",
    filename: "fixture.txt",
    content: "Exact reviewed fixture content",
    url: "https://example.com/",
    source: "authored_local_sample",
  },
  steps: [
    { id: "write_file", action: "Create text file", target: "fixture.txt" },
    { id: "open_notepad", action: "Request Notepad", target: "fixture.txt" },
    {
      id: "open_browser",
      action: "Request browser",
      target: "https://example.com/",
    },
  ],
  result: null,
};
let state: ComputerState;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  state = {
    devices: [
      {
        id: "fixture-device",
        name: "Fixture Windows PC",
        platform: "win32",
        root: "C:\\fixture",
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
    scanned_at: null,
  });
  vi.mocked(computerApi.approve).mockResolvedValue({
    ...task,
    status: "QUEUED",
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
it("switches language without changing task inputs or connecting credentials", () => {
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <OperatorProvider>
          <LanguageSelector />
          <ComputerPage />
        </OperatorProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  fireEvent.change(screen.getByLabelText("Contenido del archivo"), {
    target: { value: "Mi contenido / my content" },
  });
  fireEvent.change(screen.getByLabelText("Idioma / Language"), {
    target: { value: "en" },
  });
  expect(screen.getByLabelText("File contents")).toHaveValue(
    "Mi contenido / my content",
  );
  fireEvent.change(screen.getByLabelText("Idioma / Language"), {
    target: { value: "es" },
  });
  expect(screen.getByLabelText("Contenido del archivo")).toHaveValue(
    "Mi contenido / my content",
  );
  expect(computerApi.prepare).not.toHaveBeenCalled();
  expect(computerApi.approve).not.toHaveBeenCalled();
  expect(computerApi.state).not.toHaveBeenCalled();
});
function workspace() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OperatorProvider>
        <ComputerPage />
      </OperatorProvider>
    </QueryClientProvider>,
  );
}
async function connect() {
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "fixture-private-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByRole("heading", { name: "Fixture Windows PC" });
}

it("requires operator access and never starts computer actions just by opening the page", async () => {
  workspace();
  expect(computerApi.state).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Prepare plan" })).toBeDisabled();
  await connect();
  expect(computerApi.approve).not.toHaveBeenCalled();
  expect(
    screen.getByText("Authored sample · 0 model calls"),
  ).toBeInTheDocument();
});
it("reviews exact file content and approves only the displayed immutable digest", async () => {
  workspace();
  await connect();
  fireEvent.click(screen.getByRole("button", { name: "Review & execute" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent(task.plan.content!);
  expect(dialog).toHaveTextContent(task.plan.url!);
  expect(computerApi.approve).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "Approve & run on this computer",
    }),
  );
  await waitFor(() =>
    expect(computerApi.approve).toHaveBeenCalledWith(
      "fixture-private-capability",
      task.id,
      task.digest,
    ),
  );
});

it("reviews the detected application path and identity before approving a launch", async () => {
  const launchTask: ComputerTask = {
    ...task,
    id: "fixture-application-task",
    plan: {
      id: "fixture-application-task",
      device_id: "fixture-device",
      authorized_root: "C:\\fixture",
      kind: "open_application",
      source: "authored_application_launch",
      application: {
        id: "b".repeat(64),
        identity: "c".repeat(64),
        name: "Fixture Editor",
        path: "C:\\Fixture\\editor.exe",
      },
    },
    steps: [
      {
        id: "open_application",
        action: "Request the approved application to open",
        target: "Fixture Editor",
      },
    ],
  };
  state.tasks = [launchTask];
  workspace();
  await connect();
  fireEvent.click(screen.getByRole("button", { name: "Review & execute" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("C:\\Fixture\\editor.exe");
  expect(dialog).toHaveTextContent("c".repeat(64));
  expect(dialog).toHaveTextContent("without command-line arguments");
  expect(computerApi.approve).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "Approve & run on this computer",
    }),
  );
  await waitFor(() =>
    expect(computerApi.approve).toHaveBeenCalledWith(
      "fixture-private-capability",
      launchTask.id,
      launchTask.digest,
    ),
  );
});
it("disables a stale approval if current task state changes", async () => {
  workspace();
  await connect();
  fireEvent.click(screen.getByRole("button", { name: "Review & execute" }));
  state = { ...state, tasks: [{ ...task, digest: "b".repeat(64) }] };
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Approve & run on this computer" }),
    ).toBeDisabled(),
  );
  expect(computerApi.approve).not.toHaveBeenCalled();
});
it("requires an online agent before preparing or confirming Windows work", async () => {
  state.devices[0].last_seen = Date.now() / 1000 - 120;
  workspace();
  await connect();
  expect(screen.getByRole("button", { name: "Prepare plan" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Review & execute" }));
  expect(
    screen.getByRole("button", { name: "Approve & run on this computer" }),
  ).toBeDisabled();
});
it("withdraws device and task data on a source refresh failure", async () => {
  workspace();
  await connect();
  vi.mocked(computerApi.state).mockRejectedValue(
    new Error("Fixture local agent state offline"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("region", { name: "Selected computer task" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Prepare plan" })).toBeDisabled();
});
it("keeps application launch receipts separate from file readback verification", async () => {
  state.tasks = [
    {
      ...task,
      status: "COMPLETED",
      result: {
        ok: true,
        steps: [
          {
            id: "write_file",
            status: "VERIFIED_READBACK",
            sha256: "c".repeat(64),
          },
          { id: "open_notepad", status: "LAUNCH_REQUESTED" },
          { id: "open_browser", status: "LAUNCH_REQUESTED" },
        ],
      },
    },
  ];
  workspace();
  await connect();
  expect(
    screen.getByText("Agent read the saved file and matched its contents."),
  ).toBeInTheDocument();
  expect(
    screen.getAllByText(/Visual completion is not independently verified/),
  ).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "Review & execute" }),
  ).toBeDisabled();
});
it("requires confirmation before cancellation or revoking a paired device", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  workspace();
  await connect();
  fireEvent.click(
    screen.getByRole("button", { name: "Cancel remaining actions" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));
  expect(computerApi.cancel).not.toHaveBeenCalled();
  expect(computerApi.revoke).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  vi.mocked(computerApi.cancel).mockResolvedValue({
    ...task,
    status: "CANCELLED",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Cancel remaining actions" }),
  );
  await waitFor(() =>
    expect(computerApi.cancel).toHaveBeenCalledWith(
      "fixture-private-capability",
      task.id,
    ),
  );
});
