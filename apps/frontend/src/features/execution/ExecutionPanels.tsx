import { Flag, ShieldCheck, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import {
  terminal,
  type ExecutableAction,
  type ExecutionBundle,
} from "../../types/execution";
import { executionMetrics } from "./metrics";

export function ExecutionPanels({
  bundle,
  action,
}: {
  bundle: ExecutionBundle;
  action?: ExecutableAction;
}) {
  const metrics = executionMetrics(bundle);
  const result = action ? metrics.results.get(action.id) : undefined;
  const planned = bundle.manifest.plan_snapshot.plan.actions?.find(
    (item) => item.id === action?.planned_action_id,
  );
  return (
    <>
      <section className="live-panel live-agent-state" aria-label="Agent state">
        <div className="live-panel-heading">
          <h2>AGENT EXECUTION STATE</h2>
          <span>
            {terminal.has(bundle.session.status) ? "RECORDED" : "CURRENT STATE"}
          </span>
        </div>
        <strong
          className={`live-state state-${bundle.session.status.toLowerCase()}`}
        >
          {bundle.session.status.replaceAll("_", " ")}
        </strong>
        <p>
          {bundle.session.status === "RECOVERING"
            ? "Recovery is active. Review its evidence and approvals in Recovery Center."
            : terminal.has(bundle.session.status)
              ? "Saved execution. The browser is not presented as an active live feed."
              : "Commands remain subject to approved targets and backend policy."}
        </p>
        <small>
          Grounding: {bundle.manifest.grounding_mode.replaceAll("_", " ")}
        </small>
      </section>
      <section
        className="live-panel live-task-objective"
        aria-label="Task objective"
      >
        <div className="live-panel-heading">
          <h2>
            <Flag size={16} />
            Task Objective
          </h2>
          <span>
            #
            {bundle.session.task_id?.slice(0, 8) ||
              bundle.session.plan_id.slice(0, 8)}
          </span>
        </div>
        <p>{bundle.manifest.plan_snapshot.plan.goal}</p>
        <Link to={`/planning?plan=${bundle.session.plan_id}`}>
          Inspect reasoning tree →
        </Link>
      </section>
      <section
        className="live-panel live-action-trace"
        aria-label="Recorded action trace"
      >
        <div className="live-panel-heading">
          <h2>
            <Workflow size={16} />
            Recorded Action Trace
          </h2>
          <span>{action?.risk_level || "NO ACTION"}</span>
        </div>
        {action ? (
          <div className="live-trace-copy">
            <strong>
              {action.action_type.replaceAll("_", " ")} /{" "}
              {action.target?.name || "Page"}
            </strong>
            <p>
              {planned?.explanation ||
                "Typed manifest action; no model reasoning is inferred from its execution."}
            </p>
            <h3>Resolution</h3>
            <p>{result?.resolution?.method || "No resolution recorded yet"}</p>
            <h3>Immediate result</h3>
            <p>
              {result?.status || "PENDING"} · action executed:{" "}
              {result ? String(result.action_executed) : "Not recorded"}
            </p>
            <p>
              Postconditions:{" "}
              {result?.postconditions_satisfied == null
                ? "Not established"
                : result.postconditions_satisfied
                  ? "Satisfied"
                  : "Not satisfied"}
            </p>
            {result?.error_code && (
              <p className="execution-error">
                {result.error_code}: {result.error_message}
                {result.may_have_executed
                  ? " May have executed; review evidence before retrying."
                  : ""}
              </p>
            )}
            <details>
              <summary>Target, parameters and checks</summary>
              <pre>
                {JSON.stringify(
                  {
                    target: action.target,
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
          </div>
        ) : (
          <p className="live-small-note">
            Select an action to inspect its recorded facts.
          </p>
        )}
        <p className="live-small-note">
          {bundle.manifest.plan_snapshot.model_usage.length
            ? "Model provenance is retained in the approved plan."
            : "Authored sandbox plan. No model inference recorded."}
        </p>
      </section>
      <section className="live-runtime-grid" aria-label="Execution facts">
        <div>
          <small>ACTIONS COMPLETED</small>
          <strong>
            {metrics.completed} / {bundle.manifest.actions.length}
          </strong>
          <span>Approved steps and immediate checks</span>
        </div>
        <div>
          <small>ACTIONS EXECUTED</small>
          <strong>{metrics.executed}</strong>
          <span>Recorded action-executed flags</span>
        </div>
        <div>
          <small>FAILED STEPS</small>
          <strong>{metrics.failed}</strong>
          <span>Latest result per manifest action</span>
        </div>
        <div>
          <small>ACTION TIMEOUT</small>
          <strong>
            {bundle.manifest.limits?.action_timeout_seconds != null
              ? `${bundle.manifest.limits.action_timeout_seconds}s`
              : "Unavailable"}
          </strong>
          <span>Manifest policy limit</span>
        </div>
      </section>
      <section className="live-panel live-policy">
        <div className="live-panel-heading">
          <h2>
            <ShieldCheck size={15} />
            Execution Boundaries
          </h2>
        </div>
        <dl>
          <div>
            <dt>Max actions</dt>
            <dd>{bundle.manifest.limits?.max_actions ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Task time limit</dt>
            <dd>
              {bundle.manifest.limits?.max_duration_seconds != null
                ? `${bundle.manifest.limits.max_duration_seconds}s`
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Recovery retries</dt>
            <dd>Review recovery record</dd>
          </div>
        </dl>
        <Link to="/recovery">Open Recovery Center →</Link>
      </section>
    </>
  );
}
