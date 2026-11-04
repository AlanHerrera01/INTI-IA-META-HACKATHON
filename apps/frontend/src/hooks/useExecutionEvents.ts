import { useEffect, useRef, useState } from "react";
import { executionApi, mergeEvents } from "../services/executionApi";
import type { ExecutionEvent } from "../types/execution";

export function useExecutionEvents(
  id: string,
  token: string,
  onChange: () => void,
) {
  const key = `${id}:${token}`;
  const [state, setState] = useState<{
    key: string;
    events: ExecutionEvent[];
    connection: string;
  }>({ key: "", events: [], connection: "Disconnected" });
  const notify = useRef(onChange);
  notify.current = onChange;
  useEffect(() => {
    if (!id || !token) return;
    let stopped = false,
      restCursor = 0,
      socketCursor = 0;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    const status = (connection: string) => {
      if (!stopped)
        setState((old) => ({
          key,
          events: old.key === key ? old.events : [],
          connection,
        }));
    };
    const append = (incoming: ExecutionEvent[]) => {
      const matching = incoming.filter((event) => event.execution_id === id);
      if (stopped || !matching.length) return;
      setState((old) => ({
        key,
        events: mergeEvents(old.key === key ? old.events : [], matching),
        connection: old.key === key ? old.connection : "Loading event history",
      }));
      notify.current();
    };
    const poll = async () => {
      try {
        const incoming = await executionApi.events(id, token, restCursor);
        for (const event of incoming)
          if (event.execution_id === id)
            restCursor = Math.max(restCursor, event.sequence);
        append(incoming);
      } catch {
        status("Event history unavailable");
      }
    };
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/executions/${id}`,
      );
      socket.onopen = () => {
        status("Event stream connected");
        socket?.send(JSON.stringify({ token, after: socketCursor }));
      };
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as ExecutionEvent;
          if (
            event.execution_id !== id ||
            !event.id ||
            !Number.isFinite(event.sequence)
          )
            return;
          socketCursor = Math.max(socketCursor, event.sequence);
          append([event]);
        } catch {
          status("Polling saved events");
        }
      };
      socket.onclose = (event) => {
        if (stopped) return;
        status(
          event.code === 1000 ? "Saved event history" : "Polling saved events",
        );
        if (![1000, 4401, 4403].includes(event.code))
          retry = setTimeout(connect, 2000);
      };
      socket.onerror = () => status("Polling saved events");
    };
    connect();
    void poll();
    const interval = setInterval(() => void poll(), 2000);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(interval);
      socket?.close();
    };
  }, [id, token, key]);
  return state.key === key && id && token
    ? state
    : {
        key,
        events: [],
        connection: id && token ? "Connecting…" : "Disconnected",
      };
}
