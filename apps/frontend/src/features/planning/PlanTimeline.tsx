import type { ActionPlan } from "../../types/planning";

export function PlanTimeline({
  plan,
  compact = false,
  onFocus,
}: {
  plan: ActionPlan;
  compact?: boolean;
  onFocus?: (index: number) => void;
}) {
  if (compact) return <CompactPlan plan={plan} onFocus={onFocus} />;
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

function CompactPlan({
  plan,
  onFocus,
}: {
  plan: ActionPlan;
  onFocus?: (index: number) => void;
}) {
  return (
    <section className="studio-card studio-tree">
      <div className="studio-card-heading">
        <h2>Compiled Execution Tree</h2>
        <span className="studio-tag">{plan.actions.length} TYPED ACTIONS</span>
        <span className={`plan-status ${plan.status}`}>
          {plan.status.replaceAll("_", " ")}
        </span>
      </div>
      <p className="studio-small-note">
        Inspect the proposed actions. These rows describe a plan; they do not
        grant execution authority.
      </p>
      <ol className="studio-action-tree">
        {plan.actions.map((action, index) => (
          <li key={action.id}>
            <details
              onToggle={(event) => {
                if (event.currentTarget.open) onFocus?.(index);
              }}
            >
              <summary>
                <span
                  className={`studio-step-number risk-${action.risk_level.toLowerCase()}`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="studio-step-summary">
                  <strong>{action.target.description}</strong>
                  <small>
                    {action.action_type.replaceAll("_", " ")} /{" "}
                    {action.target.source.replaceAll("_", " ")}
                  </small>
                </span>
                <span
                  className={`risk risk-${action.risk_level.toLowerCase()}`}
                >
                  {action.risk_level}
                </span>
                <span className="studio-step-chevron" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="studio-step-detail">
                <p>{action.explanation}</p>
                <h3>Preconditions</h3>
                <ul>
                  {action.preconditions.map((condition, index) => (
                    <li key={index}>{condition}</li>
                  ))}
                </ul>
                <h3>Expected result</h3>
                <ul>
                  {action.expected_postconditions.map((condition, index) => (
                    <li key={index}>{condition}</li>
                  ))}
                </ul>
                {action.target.requires_observation && (
                  <p className="checkpoint">Fresh observation required</p>
                )}
                <dl>
                  {Object.entries(action.parameters)
                    .filter(([, value]) => value !== null)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                </dl>
                {plan.validation_results
                  .filter((finding) => finding.action_id === action.id)
                  .map((finding, index) => (
                    <p
                      key={index}
                      className={
                        finding.severity === "error"
                          ? "finding-error"
                          : "finding-warning"
                      }
                    >
                      {finding.code}: {finding.message}
                    </p>
                  ))}
              </div>
            </details>
          </li>
        ))}
      </ol>
      {!plan.actions.length && (
        <p className="studio-small-note">
          No actions generated. Review the clarification requirements.
        </p>
      )}
      {plan.validation_results.some((finding) => !finding.action_id) && (
        <div className="planning-warning">
          <h3>Plan validation</h3>
          {plan.validation_results
            .filter((finding) => !finding.action_id)
            .map((finding, index) => (
              <p key={index}>{finding.message}</p>
            ))}
        </div>
      )}
    </section>
  );
}
