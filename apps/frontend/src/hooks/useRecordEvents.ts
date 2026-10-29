import { useEffect, useRef, useState } from "react";
import type { RecordEvent } from "../types/verification";

export function mergeRecordEvents(
  previous: RecordEvent[],
  incoming: RecordEvent[],
) {
  return [
    ...new Map(
      [...previous, ...incoming].map((event) => [event.id, event]),
    ).values(),
  ].sort(
    (a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
      a.sequence - b.sequence,
  );
}

export function useRecordEvents(
  id: string,
  execution: string,
  token: string,
  scope: "verification_id" | "recovery_id",
  load: (id: string, token: string, after: number) => Promise<RecordEvent[]>,
  onChange: () => void,
) {
  const [state, setState] = useState<{
    id: string;
    events: RecordEvent[];
    connection: string;
  }>({ id: "", events: [], connection: "Disconnected" });
  const notify = useRef(onChange);
  notify.current = onChange;
  useEffect(() => {
    if (!id || !execution || !token) return;
    let stopped = false,
      restCursor = 0,
      socketCursor = 0;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    const status = (connection: string) => {
      if (!stopped)
        setState((old) => ({
          id,
          events: old.id === id ? old.events : [],
          connection,
        }));
    };
    const append = (incoming: RecordEvent[]) => {
      if (stopped || !incoming.length) return;
      setState((old) => ({
        id,
        connection: old.connection,
        events: mergeRecordEvents(old.id === id ? old.events : [], incoming),
      }));
      notify.current();
    };
    const poll = async () => {
      try {
        const incoming = await load(id, token, restCursor);
        for (const event of incoming)
          restCursor = Math.max(restCursor, event.sequence);
        append(incoming);
      } catch {
        status("Event history unavailable");
      }
    };
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/executions/${execution}`,
      );
      socket.onopen = () => {
        status("Live stream");
        socket?.send(JSON.stringify({ token, after: socketCursor }));
      };
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as RecordEvent;
          socketCursor = Math.max(socketCursor, event.sequence);
          if (event.payload[scope] === id) append([event]);
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
  }, [id, execution, token, scope, load]);
  return state.id === id
    ? state
    : { id, events: [], connection: "Connecting…" };
}
