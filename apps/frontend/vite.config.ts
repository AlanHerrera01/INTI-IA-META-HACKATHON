import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { inventoryReadBridge } from "./inventoryBridge";

export default defineConfig({
  plugins: [react(), tailwindcss(), inventoryReadBridge()],
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        ws: true,
      },
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000",
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
  },
});
