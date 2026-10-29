import type { PlanningEvent, PlanningResult } from "../../types/planning";

export function PlanInspector({
  result,
  events,
}: {
  result: PlanningResult;
  events?: PlanningEvent[];
}) {
  const seconds =
    (new Date(result.ended_at).getTime() -
      new Date(result.started_at).getTime()) /
    1000;
  return (
    <>
      <section className="panel padded">
        <div className="planning-section-title">
          <h2>Plan inspector</h2>
          <span className={`plan-status ${result.plan.status}`}>
            {result.plan.status.replaceAll("_", " ")}
          </span>
        </div>
        <dl className="planning-metadata">
          <div>
            <dt>Planning duration</dt>
            <dd>{seconds.toFixed(2)} s</dd>
          </div>
          <div>
            <dt>Task ID</dt>
            <dd className="mono">{result.plan.task_id}</dd>
          </div>
          <div>
            <dt>Correlation ID</dt>
            <dd className="mono">{result.correlation_id}</dd>
          </div>
        </dl>
        <p className="hint">{result.validation_summary}</p>
        {result.model_usage.map((usage, index) => (
          <div className="usage-row" key={`${usage.response_id}-${index}`}>
            <b>{usage.model}</b>
            <span className="mono">{usage.response_id}</span>
            <span>
              Input {usage.input_tokens ?? "unavailable"} · Output{" "}
              {usage.output_tokens ?? "unavailable"} · Retries {usage.retries}
            </span>
          </div>
        ))}
        {[
          ["Explicit requirements", result.intent.explicit_requirements],
          ["Constraints", result.intent.constraints],
          ["Assumptions", result.assumptions],
          ["Unverified inferences", result.intent.unverified_inferences],
          ["Clarification required", result.unresolved_ambiguities],
          ["Warnings", result.warnings],
        ].map(([heading, values]) => (
          <div className="inspector-group" key={heading as string}>
            <h3>{heading as string}</h3>
            {(values as string[]).length ? (
              <ul>
                {(values as string[]).map((value, index) => (
                  <li key={index}>{value}</li>
                ))}
              </ul>
            ) : (
              <p className="hint">None reported</p>
            )}
          </div>
        ))}
      </section>
      <section className="panel padded planning-trace">
        <h2>Planning trace</h2>
        {events?.length ? (
          events.map((event) => (
            <div key={event.id}>
              <span className="mono">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span>{event.kind.replaceAll("_", " ")}</span>
              {event.code && <span className="hint">{event.code}</span>}
            </div>
          ))
        ) : (
          <p className="hint">No events loaded.</p>
        )}
      </section>
    </>
  );
}
