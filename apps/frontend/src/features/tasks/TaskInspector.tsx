import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Circle,
  Download,
  Image,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../services/api";
import { VerdictBadge } from "../verification/VerdictBadge";
import { ObservationFrame } from "../observations/ObservationFrame";
import { executionMetrics } from "../execution/metrics";
import { downloadTaskJson, taskElapsed, type TaskRecord } from "./records";

export function TaskInspector({
  record,
  token,
  loading,
}: {
  record?: TaskRecord;
  token: string;
  loading: boolean;
}) {
  const detail = record?.detail;
  const mission = record?.mission;
  const execution = detail?.execution;
  const observationId =
    execution?.session.latest_observation_id || mission?.observation_id;
  const observation = useQuery({
    queryKey: ["task-observation", observationId, token],
    queryFn: () => api.observation(observationId!, token),
    enabled: !!detail && !!observationId && !!token,
    gcTime: 0,
  });
  const metrics = execution ? executionMetrics(execution) : null;
  const duration = taskElapsed(detail);
  const usage = detail?.plan?.model_usage ?? [];
  const knownTokens =
    usage.length > 0 &&
    usage.every(
      (item) =>
        item.input_tokens !== null &&
        item.output_tokens !== null &&
        Number.isFinite(item.input_tokens) &&
        Number.isFinite(item.output_tokens) &&
        item.input_tokens >= 0 &&
        item.output_tokens >= 0,
    );
  const tokens = knownTokens
    ? usage.reduce(
        (sum, item) => sum + item.input_tokens! + item.output_tokens!,
        0,
      )
    : null;
  const executionId = execution?.session.id;
  const proofId = detail?.verification_report?.verification_id;
  const recoveries = detail?.recoveries ?? [];
  return (
    <aside className="task-side-column" aria-label="Selected mission">
      <section className="task-focused-card">
        <header className="task-focused-heading">
          <strong>
            {mission ? `TASK #${mission.id.slice(0, 8)}` : "TASK INSPECTOR"}
          </strong>
          <span>FOCUSED VIEW</span>
        </header>
        {!mission ? (
          <p className="task-inspector-empty">
            Select a saved mission to inspect its objective, execution and
            independent verdict.
          </p>
        ) : (
          <>
            <div className="task-focused-content">
              <p className="task-section-label">NATURAL LANGUAGE INTENT</p>
              <p className="task-intent">{mission.objective}</p>
              <dl className="task-stage-facts">
                <div>
                  <dt>Preparation</dt>
                  <dd>{mission.status.replaceAll("_", " ")}</dd>
                </div>
                <div>
                  <dt>Execution</dt>
                  <dd>
                    {loading
                      ? "Loading…"
                      : record.error
                        ? "Unavailable"
                        : (execution?.session.status ?? "Not started")}
                  </dd>
                </div>
                <div>
                  <dt>Verification</dt>
                  <dd>
                    <VerdictBadge
                      verdict={detail?.verification_report?.effective_verdict}
                    />
                  </dd>
                </div>
              </dl>
              {record.error && (
                <p role="alert" className="mission-error">
                  {record.error}
                </p>
              )}
              {mission.error_code && (
                <p className="task-preparation-error">{mission.error_code}</p>
              )}
              <div className="task-frame-heading">
                <span>RECORDED VIEWPORT</span>
                <small>
                  {observationId && detail ? "SAVED FRAME" : "NO FRAME"}
                </small>
              </div>
              {observation.isPending && observationId && detail ? (
                <div className="task-frame-placeholder" role="status">
                  Loading protected frame…
                </div>
              ) : observation.error ? (
                <p role="alert" className="mission-error">
                  {errorMessage(observation.error)}
                </p>
              ) : observation.data && detail ? (
                <div className="task-preview">
                  <ObservationFrame
                    key={observation.data.id + token}
                    observation={observation.data}
                    token={token}
                    protectedFrame
                    thumbnail
                  />
                  <Link to={`/observations/${observation.data.id}`}>
                    Inspect original frame <ArrowRight size={12} />
                  </Link>
                </div>
              ) : (
                <div className="task-frame-placeholder">
                  <Image size={24} />
                  <p>
                    {loading
                      ? "Loading task evidence…"
                      : record.error
                        ? "Evidence unavailable."
                        : "No screenshot recorded for this task."}
                  </p>
                </div>
              )}
              <section
                className="task-execution-tree"
                aria-label="Task execution steps"
              >
                <div>
                  <span>EXECUTION TREE STEPS</span>
                  <strong>
                    {metrics
                      ? `${metrics.completed} / ${execution!.manifest.actions.length} complete`
                      : detail
                        ? "Not started"
                        : "Unavailable"}
                  </strong>
                </div>
                <progress
                  aria-label="Task action progress"
                  max={execution?.manifest.actions.length || 1}
                  value={metrics?.completed || 0}
                />
                {execution ? (
                  <ol>
                    {execution.manifest.actions.map((action, index) => {
                      const result = metrics?.results.get(action.id);
                      const passed =
                        result?.status === "SUCCEEDED" ||
                        result?.status === "SATISFIED";
                      return (
                        <li key={action.id}>
                          <span
                            className={
                              passed ? "task-step-pass" : "task-step-pending"
                            }
                          >
                            {passed ? (
                              <Check size={11} />
                            ) : (
                              <Circle size={11} />
                            )}
                            {String(index + 1).padStart(2, "0")}.{" "}
                            {action.target?.name ||
                              action.action_type.replaceAll("_", " ")}
                          </span>
                          <small>
                            {typeof result?.duration_ms === "number" &&
                            Number.isFinite(result.duration_ms) &&
                            result.duration_ms >= 0
                              ? `${result.duration_ms.toFixed(0)} ms`
                              : result?.status || "Pending"}
                          </small>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p>
                    {detail
                      ? "No execution results recorded in the loaded task detail."
                      : "Execution evidence is pending or unavailable."}
                  </p>
                )}
              </section>
              <div className="task-cost-facts">
                <div>
                  <span>EXECUTION DURATION</span>
                  <strong>
                    {duration === null
                      ? "Unavailable"
                      : `${duration.toFixed(2)} seconds`}
                  </strong>
                </div>
                <div>
                  <span>PLAN TOKEN USAGE</span>
                  <strong>
                    {tokens === null ? "Not recorded" : `${tokens} tokens`}
                  </strong>
                </div>
              </div>
              <p className="task-provenance-note">
                {mission.mode === "authored_demo"
                  ? "Authored sandbox recipe · no model inference."
                  : usage.length
                    ? `Recorded models: ${[...new Set(usage.map((item) => item.model))].join(", ")}`
                    : "Meta preparation path · no recorded model usage."}
              </p>
              <p className="task-provenance-note">
                A ready plan requires explicit approval. Completed steps do not
                establish persisted task success.
              </p>
              <div className="task-inspector-actions">
                <Link
                  className="task-proof-link"
                  to={
                    executionId
                      ? `/verification?${proofId ? `verification=${proofId}&` : ""}execution=${executionId}`
                      : `/missions/${mission.id}`
                  }
                >
                  <ShieldCheck size={15} />
                  {executionId ? "Open Verification Lab" : "Open mission"}
                  <ArrowRight size={14} />
                </Link>
                <div>
                  <button
                    disabled={!detail}
                    onClick={() =>
                      downloadTaskJson(`inti-task-${mission.id}.json`, detail)
                    }
                  >
                    <Download size={13} />
                    JSON Trace
                  </button>
                  {executionId && (
                    <Link to={`/execution?execution=${executionId}`}>
                      <Terminal size={13} />
                      Live Console
                    </Link>
                  )}
                </div>
                {executionId && (
                  <Link
                    className="task-open-mission"
                    to={`/missions/${mission.id}`}
                  >
                    Open mission <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </section>
      <section
        className="task-recovery-card"
        aria-label="Task recovery history"
      >
        <Wrench size={19} />
        <div>
          <h2>Recovery History</h2>
          <p>
            {!detail
              ? record?.error
                ? "Recovery evidence is unavailable."
                : "Select a loaded task to inspect recovery evidence."
              : recoveries.length
                ? `${recoveries.filter((item) => item.session.status === "RECOVERED").length} recovered of ${recoveries.length} recorded recovery sessions.`
                : "No recovery recorded for this task."}
          </p>
          {recoveries.length > 0 && (
            <Link to={`/recovery?recovery=${recoveries[0].session.id}`}>
              Inspect recovery record →
            </Link>
          )}
        </div>
      </section>
    </aside>
  );
}
