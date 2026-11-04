import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { ComputerApplications } from "../src/components/ComputerApplications";
import {
  computerApi,
  type ComputerApplication,
} from "../src/services/computerApi";

vi.mock("../src/services/computerApi", () => ({
  computerApi: {
    applications: vi.fn(),
    permitApplication: vi.fn(),
    prepareApplication: vi.fn(),
  },
}));
const app: ComputerApplication = {
  id: "a".repeat(64),
  identity: "b".repeat(64),
  name: "Fixture Editor",
  path: "C:\\Fixture\\editor.exe",
  allowed: false,
};
beforeEach(() => {
  vi.clearAllMocks();
});
function mount(allowed = false, scanned = Date.now() / 1000) {
  vi.mocked(computerApi.applications).mockResolvedValue({
    applications: [{ ...app, allowed }],
    scanned_at: scanned,
  });
  const onPrepared = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ComputerApplications
        token="fixture-token"
        devices={[
          {
            id: "fixture-device",
            name: "Fixture PC",
            platform: "win32",
            root: "C:\\Fixture",
            last_seen: Date.now() / 1000,
            revoked: 0,
          },
        ]}
        targetId="fixture-device"
        onTarget={vi.fn()}
        onPrepared={onPrepared}
      />
    </QueryClientProvider>,
  );
  return onPrepared;
}

it("requires explicit permission and does not prepare an unauthorized launch", async () => {
  mount();
  await screen.findByText(app.name);
  expect(
    screen.getByRole("button", { name: "Prepare application launch" }),
  ).toBeDisabled();
  vi.spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Authorize application" }),
  );
  expect(computerApi.permitApplication).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Authorize application" }),
  );
  await waitFor(() =>
    expect(computerApi.permitApplication).toHaveBeenCalledWith(
      "fixture-token",
      "fixture-device",
      app,
      true,
    ),
  );
  expect(window.confirm).toHaveBeenLastCalledWith(
    expect.stringContaining(app.path),
  );
  expect(computerApi.prepareApplication).not.toHaveBeenCalled();
});

it("prepares an allowed application for review without automatically approving it", async () => {
  const onPrepared = mount(true);
  const task = { id: "fixture-launch" };
  vi.mocked(computerApi.prepareApplication).mockResolvedValue(task as never);
  await screen.findByText(app.name);
  fireEvent.click(
    screen.getByRole("button", { name: "Prepare application launch" }),
  );
  await waitFor(() => expect(onPrepared).toHaveBeenCalledWith(task));
  expect(computerApi.prepareApplication).toHaveBeenCalledWith(
    "fixture-token",
    "fixture-device",
    { ...app, allowed: true },
  );
});

it("blocks stale application catalogs even when a permission was previously granted", async () => {
  mount(true, 1);
  await screen.findByText(app.name);
  expect(
    screen.getByRole("button", { name: "Prepare application launch" }),
  ).toBeDisabled();
});
