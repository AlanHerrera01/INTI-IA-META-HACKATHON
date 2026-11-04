import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { inventoryReadMiddleware } from "../inventoryBridge";
import { filterAssets, parseInventory } from "../src/features/inventory/data";
const rows = [
  {
    id: "fixture-PC-104",
    name: "Unit fixture workstation",
    location: "Quito Lab",
    status: "Operational",
    version: 2,
  },
];
function response() {
  return {
    statusCode: 0,
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
}
afterEach(() => {
  vi.unstubAllGlobals();
});
it("accepts only valid, uniquely identified current asset records", () => {
  expect(parseInventory(rows)).toEqual(rows);
  expect(() => parseInventory([...rows, ...rows])).toThrow(/duplicate/);
  expect(() => parseInventory([{ ...rows[0], version: -1 }])).toThrow(
    /invalid/,
  );
  expect(() => parseInventory([{ ...rows[0], status: "Certified" }])).toThrow(
    /invalid/,
  );
  expect(filterAssets(rows, "PC-104", "Quito Lab", "Operational")).toEqual(
    rows,
  );
  expect(filterAssets(rows, "", "Loja Lab", "")).toEqual([]);
});
it("fetches only the fixed inventory read endpoint and emits validated records", async () => {
  const upstream = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => rows });
  vi.stubGlobal("fetch", upstream);
  const res = response();
  await inventoryReadMiddleware(
    { url: "/inventory-data", method: "GET" } as IncomingMessage,
    res,
    vi.fn(),
  );
  expect(res.statusCode).toBe(200);
  expect(res.end).toHaveBeenCalledWith(JSON.stringify(rows));
  expect(String(upstream.mock.calls[0][0])).toMatch(/\/api\/inventory$/);
  expect(upstream.mock.calls[0][1]).toMatchObject({
    method: "GET",
    redirect: "error",
  });
});
it("rejects writes, path suffixes and query-based routing before any upstream call", async () => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  for (const [url, method, expected] of [
    ["/inventory-data", "POST", 405],
    ["/inventory-data/api/reset", "GET", 404],
    ["/inventory-data?target=http://elsewhere", "GET", 404],
  ]) {
    const res = response();
    await inventoryReadMiddleware(
      { url, method } as IncomingMessage,
      res,
      vi.fn(),
    );
    expect(res.statusCode).toBe(expected);
  }
  expect(upstream).not.toHaveBeenCalled();
});
it("reports unavailable data rather than forwarding malformed upstream inventory", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ wrong: "shape" }) }),
  );
  const res = response();
  await inventoryReadMiddleware(
    { url: "/inventory-data", method: "GET" } as IncomingMessage,
    res,
    vi.fn(),
  );
  expect(res.statusCode).toBe(502);
});
