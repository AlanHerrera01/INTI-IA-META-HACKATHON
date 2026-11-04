import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { InventoryPage } from "../src/pages/InventoryPage";
import { inventoryApi } from "../src/services/inventoryApi";
vi.mock("../src/services/inventoryApi", () => ({
  inventoryApi: { list: vi.fn() },
}));
const assets = Array.from({ length: 6 }, (_, index) => ({
  id: `fixture-${index + 1}`,
  name: `Unit fixture equipment ${index + 1}`,
  location: index === 0 ? "Quito Lab" : "Loja Lab",
  status: index === 0 ? "Operational" : "Inactive",
  version: index + 1,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(inventoryApi.list).mockResolvedValue(assets);
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
it("shows the current fleet snapshot and unknown metadata without claiming certifications or audit proof", async () => {
  mount();
  await screen.findByRole("table");
  expect(
    screen.getByRole("region", { name: "Fleet catalog" }),
  ).toHaveTextContent("6");
  expect(
    screen.getByRole("region", { name: "Operational assets" }),
  ).toHaveTextContent("1");
  expect(
    screen.getByRole("complementary", { name: "Inspection target" }),
  ).toHaveTextContent("Not recorded");
  expect(
    screen.getByRole("link", { name: /Open editable sandbox/ }),
  ).toHaveAttribute("href", "http://localhost:8001");
  expect(
    screen.queryByText(/ISO-IEC|99.4%|ZERO DRIFT/),
  ).not.toBeInTheDocument();
});
it("filters by current state, location and asset ID and updates the selected record", async () => {
  mount();
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Filter hardware status"), {
    target: { value: "Operational" },
  });
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  expect(
    screen.getByRole("complementary", { name: "Inspection target" }),
  ).toHaveTextContent("fixture-1");
  fireEvent.change(screen.getByLabelText("Filter hardware location"), {
    target: { value: "Loja Lab" },
  });
  expect(screen.getByText("No assets match these filters")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  fireEvent.change(screen.getByLabelText("Search hardware inventory"), {
    target: { value: "fixture-3" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect asset fixture-3" }),
  );
  expect(
    screen.getByRole("complementary", { name: "Inspection target" }),
  ).toHaveTextContent("Unit fixture equipment 3");
});
it("pages through the filtered catalog without retaining an asset from another page", async () => {
  mount();
  await screen.findByRole("table");
  expect(
    within(screen.getByRole("table")).queryByText("Unit fixture equipment 6"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next inventory page" }));
  expect(
    screen.getByRole("complementary", { name: "Inspection target" }),
  ).toHaveTextContent("fixture-6");
  expect(
    screen.getByRole("button", { name: "Next inventory page" }),
  ).toBeDisabled();
});
it("withdraws stale asset details and export actions when a refresh fails", async () => {
  const { client } = mount();
  await screen.findByRole("table");
  vi.mocked(inventoryApi.list).mockRejectedValue(
    new Error("Sandbox unavailable"),
  );
  await act(async () => {
    await client.refetchQueries({ queryKey: ["hardware-inventory"] });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Sandbox unavailable",
  );
  expect(
    screen.queryByRole("button", { name: "Download record" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Export filtered inventory as JSON" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("region", { name: "Fleet catalog" }),
  ).toHaveTextContent("—");
});
it("renders an empty connected catalog and supports an explicit retry", async () => {
  vi.mocked(inventoryApi.list).mockResolvedValue([]);
  mount();
  expect(await screen.findByText("No assets recorded")).toBeInTheDocument();
  vi.mocked(inventoryApi.list).mockResolvedValue(assets);
  fireEvent.click(screen.getByRole("button", { name: "Refresh inventory" }));
  await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
});
