import type { ActionPlan } from "../../types/planning";

export function PlanTimeline({ plan }: { plan: ActionPlan }) {
  return (
    <section className="panel padded">
      <div className="planning-section-title">
        <h2>Action plan</h2>
        <span className="mono subtle">INSPECTION ONLY</span>
      </div>
      <p className="hint">{plan.goal}</p>
      {plan.actions.length === 0 && (
        <p className="hint">
          No actions generated. Review the clarification requirements.
        </p>
      )}
      <ol className="plan-timeline">
        {plan.actions.map((action, index) => {
          const findings = plan.validation_results.filter(
            (f) => f.action_id === action.id,
          );
          return (
            <li key={action.id}>
              <div className="timeline-number">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="timeline-body">
                <div className="planning-section-title">
                  <h3>{action.action_type.replaceAll("_", " ")}</h3>
                  <span
                    className={`risk risk-${action.risk_level.toLowerCase()}`}
                  >
                    {action.risk_level}
                  </span>
                </div>
                <p>{action.target.description}</p>
                <span className="provenance">{action.target.source}</span>
                {action.target.requires_observation && (
                  <span className="checkpoint">Fresh observation required</span>
                )}
                <p className="hint">{action.explanation}</p>
                <h4>Preconditions</h4>
                <ul>
                  {action.preconditions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                <h4>Expected result</h4>
                <ul>
                  {action.expected_postconditions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                <div className="parameter-list">
                  {Object.entries(action.parameters)
                    .filter(([, value]) => value !== null)
                    .map(([key, value]) => (
                      <p key={key}>
                        <span>{key}: </span>
                        {String(value)}
                      </p>
                    ))}
                </div>
                <div className="step-validation">
                  {findings.length ? (
                    findings.map((finding, i) => (
                      <p
                        key={i}
                        className={
                          finding.severity === "error"
                            ? "finding-error"
                            : "finding-warning"
                        }
                      >
                        {finding.code}: {finding.message}
                      </p>
                    ))
                  ) : (
                    <span className="good">
                      Deterministic checks passed for this step
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {plan.validation_results.some((f) => !f.action_id) && (
        <div className="planning-warning">
          <h3>Plan validation</h3>
          <ul>
            {plan.validation_results
              .filter((f) => !f.action_id)
              .map((f, i) => (
                <li key={i}>
                  {f.code}: {f.message}
                </li>
              ))}
          </ul>
        </div>
      )}
      <div className="planning-safety">
        Planning-only milestone. No generated action has been executed.
      </div>
    </section>
  );
}
