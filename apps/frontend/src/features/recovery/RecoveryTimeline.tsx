import { useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useRecordEvents } from "../../hooks/useRecordEvents";
import { recoveryApi } from "../../services/recoveryApi";
import type { RecoveryBundle } from "../../types/recovery";

export function RecoveryTimeline({
  bundle,
  token,
}: {
  bundle?: RecoveryBundle;
  token: string;
}) {
  const id = bundle?.session.id || "";
  const client = useQueryClient();
  const events = useRecordEvents(
    id,
    bundle?.session.execution_id || "",
    token,
    "recovery_id",
    recoveryApi.events,
    () => void client.invalidateQueries({ queryKey: ["recovery", token, id] }),
  );
  return (
    <section className="recovery-log" aria-label="Recovery event log">
      <header>
        <h2>
          <History size={20} />
          Recovery Execution Log
        </h2>
        <span>{bundle ? events.connection : "NO RECORD SELECTED"}</span>
      </header>
      <p className="recovery-small-note">
        Persisted event timestamps and payloads. No sub-second latency is
        inferred from this view.
      </p>
      {events.events.length ? (
        <ol>
          {events.events.map((event) => (
            <li key={event.id}>
              <span className="recovery-log-dot" />
              <div>
                <time>{new Date(event.timestamp).toLocaleString()}</time>
                <strong>{event.event_type.replaceAll("_", " ")}</strong>
                <details>
                  <summary>Recorded event payload</summary>
                  <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                </details>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="recovery-log-empty">
          {bundle
            ? "Loading or awaiting saved recovery events."
            : "No recovery events have been recorded for a selected case."}
        </div>
      )}
      {bundle && (
        <details className="recovery-attempts">
          <summary>Recorded attempts · {bundle.attempts.length}</summary>
          {bundle.attempts.length ? (
            bundle.attempts.map((attempt) => (
              <p key={attempt.id}>
                Attempt {attempt.attempt_number} · {attempt.outcome} ·{" "}
                {attempt.completed_at
                  ? new Date(attempt.completed_at).toLocaleString()
                  : "In progress"}
              </p>
            ))
          ) : (
            <p>No attempt records yet.</p>
          )}
        </details>
      )}
    </section>
  );
}
