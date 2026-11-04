import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { parseInventory } from "./src/features/inventory/data";

export async function inventoryReadMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  const path = req.url?.split("?")[0];
  if (path !== "/inventory-data" && !path?.startsWith("/inventory-data/")) {
    next();
    return;
  }
  const reply = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));
  };
  if (path !== "/inventory-data" || req.url !== "/inventory-data") {
    reply(404, { error: { message: "Inventory read route not found." } });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    reply(405, { error: { message: "Inventory connection is read-only." } });
    return;
  }
  try {
    const origin =
      process.env.INVENTORY_PROXY_TARGET || "http://127.0.0.1:8001";
    const response = await fetch(new URL("/api/inventory", origin), {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Inventory request failed");
    reply(200, parseInventory(await response.json()));
  } catch {
    reply(502, {
      error: {
        message:
          "Inventory is unavailable. Check the connected sandbox and refresh.",
      },
    });
  }
}
export function inventoryReadBridge(): Plugin {
  return {
    name: "inti-inventory-read-bridge",
    configureServer(server) {
      server.middlewares.use(inventoryReadMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(inventoryReadMiddleware);
    },
  };
}
