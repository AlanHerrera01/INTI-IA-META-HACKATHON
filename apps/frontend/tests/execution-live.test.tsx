import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useExecutionEvents } from "../src/hooks/useExecutionEvents";
import { executionApi } from "../src/services/executionApi";
import { executionMetrics } from "../src/features/execution/metrics";
import type { ExecutionBundle, ExecutionEvent } from "../src/types/execution";

vi.mock("../src/services/executionApi", async (original) => ({
  ...(await original<typeof import("../src/services/executionApi")>()),
  executionApi: { events: vi.fn() },
}));
class Socket {
  static instances: Socket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {
    Socket.instances.push(this);
  }
}
const event = (executionId: string, sequence: number): ExecutionEvent => ({
  id: `${executionId}-event-${sequence}`,
  execution_id: executionId,
  sequence,
  event_type: "action_completed",
  timestamp: "2026-10-30T12:00:00Z",
  payload: {},
});
beforeEach(() => {
  vi.clearAllMocks();
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.mocked(executionApi.events).mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
});

it("clears events across execution and capability changes and ignores late responses", async () => {
  let finish: (events: ExecutionEvent[]) => void = () => {};
  vi.mocked(executionApi.events).mockImplementation((id) =>
    id === "first"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve([event("second", 2), event("first", 99)]),
  );
  const hook = renderHook(
    ({ id, token }) => useExecutionEvents(id, token, vi.fn()),
    { initialProps: { id: "first", token: "fixture-capability" } },
  );
  hook.rerender({ id: "second", token: "fixture-capability" });
  await act(async () => {
    finish([event("first", 1)]);
  });
  expect(hook.result.current.events.map((item) => item.execution_id)).toEqual([
    "second",
  ]);
  expect(Socket.instances[0].close).toHaveBeenCalled();
  hook.rerender({ id: "second", token: "" });
  expect(hook.result.current.events).toEqual([]);
  expect(hook.result.current.connection).toBe("Disconnected");
  hook.unmount();
});
it("keeps independent polling and socket cursors so a high socket sequence cannot skip REST history", async () => {
  vi.useFakeTimers();
  vi.mocked(executionApi.events)
    .mockResolvedValueOnce([event("run", 1)])
    .mockResolvedValueOnce([event("run", 2)]);
  const hook = renderHook(() =>
    useExecutionEvents("run", "fixture-capability", vi.fn()),
  );
  await act(async () => {});
  const socket = Socket.instances[0];
  act(() => {
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify(event("run", 9)) });
  });
  expect(socket.url).not.toContain("fixture-capability");
  expect(socket.send).toHaveBeenCalledWith(
    JSON.stringify({ token: "fixture-capability", after: 0 }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(executionApi.events).toHaveBeenLastCalledWith(
    "run",
    "fixture-capability",
    1,
  );
  expect(hook.result.current.events.map((item) => item.sequence)).toEqual([
    1, 2, 9,
  ]);
  hook.unmount();
});
it("counts only the latest result for each approved action and excludes invalid timing samples", () => {
  const bundle = {
    session: {
      started_at: "2026-10-30T12:00:00Z",
      completed_at: "2026-10-30T12:00:05Z",
    },
    manifest: { actions: [{ id: "first" }, { id: "second" }] },
    results: [
      {
        action_id: "first",
        status: "FAILED",
        duration_ms: 500,
        action_executed: false,
      },
      {
        action_id: "first",
        status: "SUCCEEDED",
        duration_ms: 0,
        action_executed: true,
      },
      {
        action_id: "second",
        status: "SUCCEEDED",
        duration_ms: -4,
        action_executed: true,
      },
      {
        action_id: "unrelated",
        status: "SUCCEEDED",
        duration_ms: 1000,
        action_executed: true,
      },
    ],
  } as unknown as ExecutionBundle;
  const summary = executionMetrics(bundle);
  expect(summary).toMatchObject({
    completed: 2,
    executed: 2,
    failed: 0,
    elapsed: 5,
    averageActionMs: 0,
  });
});
