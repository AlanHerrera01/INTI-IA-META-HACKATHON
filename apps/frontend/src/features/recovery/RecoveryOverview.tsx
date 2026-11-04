import type { RecoveryBundle } from "../../types/recovery";

export function RecoveryOverview({ bundle }: { bundle: RecoveryBundle }) {
  const { session: s } = bundle;
  return (
    <section className="execution-panel">
      <h2>Recovery · {s.status}</h2>
      <p>{bundle.context.observed_state}</p>
      <p>{s.final_outcome || bundle.context.error_details}</p>
      <div className="execution-metrics">
        <div>
          <small>Attempts</small>
          <strong>
            {s.attempts_count} / {s.budget.max_attempts}
          </strong>
        </div>
        <div>
          <small>Model calls</small>
          <strong>
            {s.model_calls} / {s.budget.max_model_calls}
          </strong>
        </div>
        <div>
          <small>Actions</small>
          <strong>
            {s.actions_used} / {s.budget.max_actions}
          </strong>
        </div>
        <div>
          <small>Time limit</small>
          <strong>{s.budget.max_duration_seconds}s</strong>
        </div>
      </div>
      <p>
        Tokens: {s.tokens_used ?? "Unreported"} /{" "}
        {s.budget.max_tokens_optional ?? "No aggregate token cap"}
      </p>
    </section>
  );
}
