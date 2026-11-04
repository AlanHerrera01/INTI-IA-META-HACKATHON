import type { ExecutionBundle } from "../../types/execution";
import { executionMetrics } from "./metrics";

export function ExecutionDashboard({ bundle }: { bundle: ExecutionBundle }) {
  const { session, manifest } = bundle;
  const { completed } = executionMetrics(bundle);
  const elapsed = session.started_at
    ? Math.max(
        0,
        (Date.parse(session.completed_at || session.updated_at) -
          Date.parse(session.started_at)) /
          1000,
      )
    : 0;
  return (
    <section className="execution-panel">
      <div className="execution-title">
        <h2>{manifest.plan_snapshot.plan.goal}</h2>
        <strong
          className={`execution-status state-${session.status.toLowerCase()}`}
        >
          {session.status}
        </strong>
      </div>
      <div className="execution-metrics">
        <div>
          <small>Actions completed</small>
          <strong>
            {completed} / {manifest.actions.length}
          </strong>
        </div>
        <div>
          <small>Current action</small>
          <strong>
            {manifest.actions[session.current_action_index]?.action_type || "—"}
          </strong>
        </div>
        <div>
          <small>Elapsed</small>
          <strong>{elapsed.toFixed(1)}s</strong>
        </div>
        <div>
          <small>Authorization</small>
          <strong>
            {bundle.decisions.length} / {manifest.actions.length}
          </strong>
        </div>
      </div>
      <progress
        aria-label="Execution progress"
        max={manifest.actions.length || 1}
        value={completed}
      />
      <p className="execution-help">
        Completed means the approved steps and immediate checks finished.
        Execution's goal-verification declaration:{" "}
        {session.overall_goal_verified
          ? "verified"
          : "not independently verified by this engine"}
        . See the independent report below.
      </p>
      {session.error_summary && (
        <p role="alert" className="execution-error">
          {session.error_code}: {session.error_summary}
        </p>
      )}
    </section>
  );
}

export function ActionTimeline({ bundle }: { bundle: ExecutionBundle }) {
  const { results } = executionMetrics(bundle);
  return (
    <section className="execution-panel">
      <h2>Action timeline</h2>
      <ol className="execution-actions">
        {bundle.manifest.actions.map((action, index) => {
          const result = results.get(action.id);
          return (
            <li key={action.id}>
              <div className="execution-action-heading">
                <strong>
                  {index + 1}. {action.action_type}
                </strong>
                <span>{action.target?.name || "Page"}</span>
                <small>{action.risk_level}</small>
                <b>{result?.status || "PENDING"}</b>
              </div>
              <p>
                {result?.resolution?.method || "Fresh resolution required"} ·
                executed: {String(result?.action_executed ?? false)} · immediate
                checks:{" "}
                {result?.postconditions_satisfied == null
                  ? "pending"
                  : String(result.postconditions_satisfied)}
              </p>
              {result?.started_at && (
                <small>
                  {new Date(result.started_at).toLocaleTimeString()} →{" "}
                  {result.completed_at
                    ? new Date(result.completed_at).toLocaleTimeString()
                    : "in progress"}{" "}
                  · {result.duration_ms?.toFixed(0) ?? "—"} ms
                </small>
              )}
              {result?.error_code && (
                <p className="execution-error">
                  {result.error_code}: {result.error_message}
                  {result.may_have_executed &&
                    " · May have executed; no automatic retry."}
                </p>
              )}
              <details>
                <summary>Parameters, checks and evidence</summary>
                <pre>
                  {JSON.stringify(
                    {
                      parameters: action.parameters,
                      preconditions: action.preconditions,
                      postconditions: action.expected_postconditions,
                      before: result?.before_observation_id,
                      after: result?.after_observation_id,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
