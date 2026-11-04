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
import { ActivityPage } from "../src/pages/ActivityPage";
import { OperatorProvider } from "../src/app/OperatorContext";
import { missionApi } from "../src/services/missionApi";
import { downloadTaskJson } from "../src/features/tasks/records";
import type { MissionActivity, MissionOverview } from "../src/types/mission";

vi.mock("../src/services/missionApi", () => ({
  missionApi: { overview: vi.fn() },
}));
vi.mock("../src/features/tasks/records", () => ({ downloadTaskJson: vi.fn() }));
const sources = ["execution", "verification", "recovery", "planning"] as const;
const events: MissionActivity[] = Array.from({ length: 8 }, (_, index) => ({
  id: `fixture-event-${index}`,
  source: sources[index % 4],
  event_type: `fixture_action_${index}`,
  timestamp: `2026-11-01T12:00:0${index}Z`,
}));
const overview = {
  recent_events: events,
  private_approval: "fixture-private-approval",
} as unknown as MissionOverview;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(missionApi.overview).mockResolvedValue(overview);
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
      <OperatorProvider>
        <MemoryRouter>
          <ActivityPage />
        </MemoryRouter>
      </OperatorProvider>
    </QueryClientProvider>,
  );
}
async function connect() {
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "fixture-local-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeEnabled(),
  );
}

it("requires an operator and shows only loaded-window counts", async () => {
  workspace();
  expect(missionApi.overview).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  await connect();
  expect(
    screen.getByRole("region", { name: "Loaded events in loaded window" }),
  ).toHaveTextContent("8");
  expect(
    screen.getByRole("region", { name: "Recovery events in loaded window" }),
  ).toHaveTextContent("2");
  expect(
    screen.getByRole("region", { name: "Selected event details" }),
  ).toHaveTextContent("SeverityNot provided by this feed");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Zero Breach|148,920|ALAN VHA|SAM 3.1/),
  ).not.toBeInTheDocument();
});
it("filters and paginates the bounded window while keeping counters scoped to all loaded events", async () => {
  workspace();
  await connect();
  const feed = screen.getByRole("region", { name: "Recent persisted events" });
  expect(within(feed).getAllByRole("article")).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(within(feed).getAllByRole("article")).toHaveLength(2);
  expect(
    screen.getByRole("region", { name: "Selected event details" }),
  ).toHaveTextContent("fixture-event-6");
  fireEvent.change(screen.getByLabelText("Event source"), {
    target: { value: "planning" },
  });
  expect(within(feed).getAllByRole("article")).toHaveLength(2);
  expect(
    screen.getByRole("region", { name: "Loaded events in loaded window" }),
  ).toHaveTextContent("8");
  fireEvent.change(screen.getByLabelText("Event type"), {
    target: { value: "fixture_action_3" },
  });
  expect(within(feed).getAllByRole("article")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Search activity events"), {
    target: { value: "no-such-event" },
  });
  expect(
    screen.getByRole("heading", { name: "No events match these filters" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Copy JSON" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(within(feed).getAllByRole("article")).toHaveLength(6);
});
it("selects exact visible metadata and clears copy status on selection changes", async () => {
  workspace();
  await connect();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Inspect verification event fixture-event-1",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
  await screen.findByText("Event metadata copied");
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    JSON.stringify(events[1], null, 2),
  );
  expect(
    screen.getByRole("link", { name: "Browse Verification workspace" }),
  ).toHaveAttribute("href", "/verification");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByText("Event metadata copied")).not.toBeInTheDocument();
});
it("exports only filtered event metadata and excludes capability, search text and unrelated overview data", async () => {
  workspace();
  await connect();
  fireEvent.change(screen.getByLabelText("Event source"), {
    target: { value: "execution" },
  });
  fireEvent.change(screen.getByLabelText("Search activity events"), {
    target: { value: "fixture" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
  expect(downloadTaskJson).toHaveBeenCalledWith(
    "inti-activity-window.json",
    expect.objectContaining({
      scope: "filtered_recent_window",
      loaded_event_count: 8,
      exported_event_count: 2,
      events: [events[0], events[4]],
      filters: {
        source: "execution",
        event_type: "all",
        period: "all",
        text_search_applied: true,
      },
    }),
  );
  const data = JSON.stringify(vi.mocked(downloadTaskJson).mock.calls[0][1]);
  expect(data).not.toMatch(
    /fixture-local-capability|fixture-private-approval|private_approval/,
  );
});
it("withdraws cached events, inspector and export actions after a read error", async () => {
  workspace();
  await connect();
  vi.mocked(missionApi.overview).mockRejectedValue(
    new Error("Fixture activity unavailable"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("alert");
  expect(
    screen.getByRole("heading", { name: "Activity unavailable" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("fixture-event-0")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Copy JSON" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Loaded events in loaded window" }),
  ).toHaveTextContent("—");
});
it("allows manual reads while this view's auto-refresh is paused and retains metadata in compact view", async () => {
  workspace();
  await connect();
  fireEvent.click(screen.getByRole("button", { name: "Pause auto-refresh" }));
  expect(screen.getByText("Auto-refresh paused")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Compact view" }));
  expect(screen.getByRole("button", { name: "Compact view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(missionApi.overview).toHaveBeenCalledTimes(2));
  expect(
    screen.getByRole("region", { name: "Selected event details" }),
  ).toHaveTextContent("fixture-event-0");
  fireEvent.click(screen.getByRole("button", { name: "Resume auto-refresh" }));
  expect(screen.getByText("Auto-refresh every 5s")).toBeInTheDocument();
});
it("clears protected events on disconnect and resets view state for a new capability", async () => {
  workspace();
  await connect();
  fireEvent.click(screen.getByRole("button", { name: "Compact view" }));
  fireEvent.click(
    screen.getByText("Operator access loaded · Manage connection"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  expect(screen.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  expect(screen.queryByText("fixture-event-0")).not.toBeInTheDocument();
  await connect();
  expect(screen.getByRole("button", { name: "Compact view" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
it("shows zero only for an authenticated empty window without invented security or payload data", async () => {
  vi.mocked(missionApi.overview).mockResolvedValue({
    recent_events: [],
  } as unknown as MissionOverview);
  workspace();
  fireEvent.change(screen.getByLabelText("Operator capability"), {
    target: { value: "fixture-local-capability" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByRole("heading", {
    name: "No persisted events in the loaded window",
  });
  expect(
    screen.getByRole("region", { name: "Loaded events in loaded window" }),
  ).toHaveTextContent("0");
  expect(screen.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Copy JSON" }),
  ).not.toBeInTheDocument();
});
