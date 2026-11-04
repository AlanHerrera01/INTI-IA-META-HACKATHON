import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DocumentWorkflowForm } from "../src/components/DocumentWorkflowForm";
import { computerApi, type ComputerTask } from "../src/services/computerApi";

vi.mock("../src/services/computerApi", () => ({ computerApi: { prepareDocuments: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
const device = { id: "fixture-device", name: "Fixture PC", root: "C:\\Fixture", platform: "win32", revoked: 0, last_seen: Date.now() / 1000 };

it("blocks incomplete data before preparing or approving any document task", () => {
  const prepared = vi.fn();
  render(<DocumentWorkflowForm token="fixture" devices={[device]} deviceId={device.id} onDevice={vi.fn()} onPrepared={prepared}/>);
  fireEvent.click(screen.getByRole("button", {name: "Prepare document dossier"}));
  expect(screen.getByRole("alert")).toHaveTextContent("Complete the customer");
  expect(computerApi.prepareDocuments).not.toHaveBeenCalled();
  expect(prepared).not.toHaveBeenCalled();
});

it("sends reviewed form inputs as integer cents and only prepares a draft", async () => {
  const task = { id: "fixture-draft" } as ComputerTask;
  vi.mocked(computerApi.prepareDocuments).mockResolvedValue(task);
  const prepared = vi.fn();
  render(<DocumentWorkflowForm token="fixture" devices={[device]} deviceId={device.id} onDevice={vi.fn()} onPrepared={prepared}/>);
  for (const [label,value] of Object.entries({"Quotation reference":"INTI-EC-104", "Customer name":"Fixture company", "Contact name":"Demo contact", "Contact email":"demo@example.com", "City":"Quito", "Issue date":"2026-11-03", "Valid until":"2026-11-18", "Description 1":"Fixture service", "Quantity 1":"3", "Unit price USD 1":"123.45", "Tax rate (%)":"5"})) {
    fireEvent.change(screen.getByLabelText(label), {target:{value}});
  }
  fireEvent.click(screen.getByRole("button", {name: "Prepare document dossier"}));
  await waitFor(() => expect(prepared).toHaveBeenCalledWith(task));
  expect(computerApi.prepareDocuments).toHaveBeenCalledExactlyOnceWith("fixture", device.id,
    expect.objectContaining({tax_basis_points:500, items:[{description:"Fixture service", quantity:3, unit_cents:12345}]}));
});
