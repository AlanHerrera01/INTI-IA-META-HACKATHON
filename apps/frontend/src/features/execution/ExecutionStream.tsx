import { useState } from "react";
import { Activity, Terminal } from "lucide-react";
import {
  terminal,
  type ExecutionBundle,
  type ExecutionEvent,
} from "../../types/execution";
import { executionMetrics } from "./metrics";

export function ExecutionStream({
  bundle,
  selected,
  onSelect,
  events,
  connection,
}: {
  bundle: ExecutionBundle;
  selected: string;
  onSelect: (id: string) => void;
  events: ExecutionEvent[];
  connection: string;
}) {
  const [filter, setFilter] = useState("");
  const { results } = executionMetrics(bundle);
  const matching = events.filter((event) =>
    `${event.sequence} ${event.event_type} ${JSON.stringify(event.payload)}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <>
      <section className="live-panel live-stream" aria-label="Action stream">
        <div className="live-panel-heading">
          <h2>
            <Activity size={17} />
            Perception Stream
          </h2>
          <span>{bundle.manifest.actions.length} STEPS</span>
        </div>
        <p className="live-small-note">
          Approved typed actions and their recorded results.
        </p>
        <ol className="live-step-list">
          {bundle.manifest.actions.map((action, index) => {
            const result = results.get(action.id);
            const state =
              result?.status ||
              (!terminal.has(bundle.session.status) &&
              index === bundle.session.current_action_index &&
              bundle.session.status === "RUNNING"
                ? "CURRENT"
                : "PENDING");
            return (
              <li
                key={action.id}
                className={`live-step-${state.toLowerCase()}`}
              >
                <button
                  aria-label={`Inspect action ${index + 1}: ${action.target?.name || action.action_type}`}
                  aria-pressed={selected === action.id}
                  onClick={() => onSelect(action.id)}
                >
                  <div>
                    <span className="live-step-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <time>
                      {result?.started_at
                        ? new Date(result.started_at).toLocaleTimeString()
                        : "Not started"}
                    </time>
                    <span className="live-step-state">{state}</span>
                  </div>
                  <strong>
                    {action.target?.name ||
                      action.action_type.replaceAll("_", " ")}
                  </strong>
                  <p>
                    {action.action_type.replaceAll("_", " ")} ·{" "}
                    {action.risk_level}
                  </p>
                  <small>
                    {result?.error_code ||
                      result?.resolution?.method ||
                      "Fresh resolution required"}
                  </small>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <section
        className="live-panel live-event-feed"
        aria-label="Persisted event feed"
      >
        <div className="live-panel-heading">
          <h2>
            <Terminal size={15} />
            Event Feed
          </h2>
          <span>{events.length} LOADED</span>
        </div>
        <p className="live-connection-status">{connection}</p>
        <input
          aria-label="Filter execution events"
          placeholder="Filter recorded events…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <ol>
          {matching.map((event) => (
            <li key={event.id}>
              <details>
                <summary>
                  <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                  <strong>{event.event_type.replaceAll("_", " ")}</strong>
                  <small>#{event.sequence}</small>
                </summary>
                <pre>{JSON.stringify(event.payload, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ol>
        {!matching.length && (
          <p className="live-small-note">
            {events.length
              ? "No events match this filter."
              : "Waiting for saved event history."}
          </p>
        )}
      </section>
    </>
  );
}
