import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { recoveryApi } from "../services/recoveryApi";
import { executionApi } from "../services/executionApi";
import { errorMessage } from "../services/api";
import { useRecordEvents } from "../hooks/useRecordEvents";
import type { RecoveryBundle } from "../types/recovery";
import "../styles/execution.css";
import "../styles/verification.css";

const stopped = new Set(["RECOVERED", "FAILED", "CANCELLED", "ESCALATED"]);
export function RecoveryPage() {
  const [draft, setDraft] = useState("");
  const [token, setToken] = useState("");
  const [id, setId] = useState("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<"plan" | "high_risk" | null>(null);
  const query = useQueryClient();
  const history = useQuery({
    queryKey: ["recoveries", token, offset],
    queryFn: () => recoveryApi.list(token, offset),
    enabled: !!token,
    refetchInterval: 2000,
  });
  const selected = useQuery({
    queryKey: ["recovery", token, id],
    queryFn: () => recoveryApi.get(id, token),
    enabled: !!token && !!id,
    refetchInterval: 1000,
  });
  const bundle = selected.data;
  const events = useRecordEvents(
    id,
    bundle?.session.execution_id || "",
    token,
    "recovery_id",
    recoveryApi.events,
    () => void query.invalidateQueries({ queryKey: ["recovery", token, id] }),
  );
  const run = async (work: () => Promise<RecoveryBundle>) => {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      query.setQueryData(["recovery", token, id], result);
      setReview(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="execution-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">DETECT · DIAGNOSE · RECOVER</p>
          <h1>Recovery Center</h1>
          <p>Review failures, bounded repairs and renewed authorization.</p>
        </div>
        <span className="execution-chip">PHASE 04</span>
      </div>
      <form
        className="execution-auth"
        onSubmit={(e) => {
          e.preventDefault();
          setToken(draft);
          setId("");
          setReview(null);
        }}
      >
        <label>
          Operator token
          <input
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <button disabled={!draft}>Connect</button>
        {token && (
          <button
            type="button"
            onClick={() => {
              setToken("");
              setDraft("");
              setId("");
              query.removeQueries({ queryKey: ["recovery"] });
              query.removeQueries({ queryKey: ["recoveries"] });
            }}
          >
            Disconnect
          </button>
        )}
        <small>
          Capability stays in memory. Expanded scope requires explicit approval.
        </small>
      </form>
      {(error || history.error || selected.error) && (
        <p role="alert" className="execution-error">
          {error || errorMessage(history.error || selected.error)}
        </p>
      )}
      <div className="execution-layout">
        <aside className="execution-panel">
          <h2>Recovery history</h2>
          {history.isLoading && <p role="status">Loading recoveries…</p>}
          {history.data?.items.length === 0 && <p>No recovery records yet.</p>}
          <div className="execution-history">
            {history.data?.items.map((item) => (
              <button
                key={item.session.id}
                aria-pressed={item.session.id === id}
                onClick={() => {
                  setId(item.session.id);
                  setReview(null);
                }}
              >
                <strong>{item.session.status}</strong>
                <span>{item.session.initial_failure_type}</span>
                <small>
                  {new Date(item.session.started_at).toLocaleString()}
                </small>
              </button>
            ))}
          </div>
          <div className="execution-controls">
            <button
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous
            </button>
            <button
              disabled={!history.data || offset + 20 >= history.data.total}
              onClick={() => setOffset(offset + 20)}
            >
              Next
            </button>
          </div>
        </aside>
        <section className="execution-main">
          {!bundle ? (
            <div className="execution-panel">
              <h2>Select a recovery</h2>
              <p>
                Recovery starts after a structured execution failure. Model
                proposals pass deterministic validation before any action.
              </p>
            </div>
          ) : (
            <>
              <RecoveryOverview bundle={bundle} />
              <section className="execution-panel">
                <h2>Controls</h2>
                <div className="execution-controls">
                  <button
                    disabled={busy || stopped.has(bundle.session.status)}
                    onClick={() =>
                      void run(() => recoveryApi.control(id, "cancel", token))
                    }
                  >
                    Cancel recovery and execution
                  </button>
                  <button
                    disabled={
                      busy ||
                      bundle.session.status !== "ESCALATED" ||
                      !bundle.session.retry_allowed
                    }
                    onClick={() =>
                      void run(() => recoveryApi.control(id, "retry", token))
                    }
                  >
                    Retry within remaining budget
                  </button>
                  <Link
                    to={`/verification?execution=${bundle.session.execution_id}`}
                  >
                    Verify persisted outcome
                  </Link>
                </div>
                <p>
                  Recovered means the interrupted action's checks passed.
                  Independent verification determines task success.
                </p>
              </section>
              <section className="execution-panel">
                <h2>Before and after evidence</h2>
                <div className="recovery-images">
                  <RecoveryImage
                    id={bundle.context.previous_observation_id}
                    token={token}
                    label="Before failure"
                  />
                  <RecoveryImage
                    id={
                      bundle.session.evidence_ids.at(-1) ||
                      bundle.context.current_observation_id
                    }
                    token={token}
                    label="Fresh recovery observation"
                  />
                </div>
              </section>
              {bundle.diagnoses.map((d) => (
                <section className="execution-panel" key={d.id}>
                  <h2>Diagnosis · {d.failure_type}</h2>
                  <p>{d.change_summary}</p>
                  <h3>Observed facts</h3>
                  <ul>
                    {d.observed_facts.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                  <h3>Hypotheses</h3>
                  <ul>
                    {d.hypotheses.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                  <h3>Uncertainties</h3>
                  <p>{d.uncertainties.join("; ") || "None declared"}</p>
                </section>
              ))}
              {bundle.plan && (
                <section className="execution-panel">
                  <h2>Proposed repair</h2>
                  <p>{bundle.plan.objective}</p>
                  <p>{bundle.plan.decision.justification}</p>
                  <code className="evidence-hash">{bundle.plan.digest}</code>
                  <ol>
                    {bundle.plan.actions.map((a) => (
                      <li key={a.id}>
                        <strong>
                          {a.action_type} · {a.risk_level}
                        </strong>{" "}
                        {a.target?.name}
                        <details>
                          <summary>Parameters and assertions</summary>
                          <pre>
                            {JSON.stringify(
                              {
                                parameters: a.parameters,
                                preconditions: a.preconditions,
                                postconditions: a.expected_postconditions,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </li>
                    ))}
                  </ol>
                  {bundle.session.status === "AWAITING_APPROVAL" && (
                    <div className="execution-controls">
                      <button
                        disabled={busy || bundle.plan_approved}
                        onClick={() => setReview("plan")}
                      >
                        Review plan approval
                      </button>
                      <button
                        disabled={busy || !bundle.plan_approved}
                        onClick={() => setReview("high_risk")}
                      >
                        Review HIGH risk actions
                      </button>
                    </div>
                  )}
                  {review && (
                    <div
                      role="dialog"
                      aria-label="Confirm recovery authorization"
                      className="execution-panel"
                    >
                      <h3>
                        Authorize{" "}
                        {review === "plan"
                          ? "this exact repair plan"
                          : "HIGH risk repair actions"}
                      </h3>
                      <p>
                        The digest above binds this approval to the displayed
                        objective, controls, parameters and assertions.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            recoveryApi.approve(
                              bundle,
                              token,
                              review,
                              review === "high_risk"
                                ? bundle
                                    .plan!.actions.filter(
                                      (a) => a.risk_level === "HIGH",
                                    )
                                    .map((a) => a.id)
                                : [],
                            ),
                          )
                        }
                      >
                        Confirm authorization
                      </button>
                      <button onClick={() => setReview(null)}>Back</button>
                    </div>
                  )}
                </section>
              )}
              <section className="execution-panel">
                <h2>Attempts</h2>
                {bundle.attempts.map((a) => (
                  <p key={a.id}>
                    Attempt {a.attempt_number} · {a.outcome} ·{" "}
                    {a.completed_at
                      ? new Date(a.completed_at).toLocaleTimeString()
                      : "In progress"}
                  </p>
                ))}
              </section>
              <section className="execution-panel">
                <h2>Timeline</h2>
                <small>{events.connection}</small>
                <ol>
                  {events.events.map((e) => (
                    <li key={e.id}>
                      {new Date(e.timestamp).toLocaleTimeString()} ·{" "}
                      {e.event_type}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
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
function RecoveryImage({
  id,
  token,
  label,
}: {
  id: string;
  token: string;
  label: string;
}) {
  const [resource, setResource] = useState<{ id: string; url: string } | null>(
    null,
  );
  const image = useQuery({
    queryKey: ["recovery-image", token, id],
    queryFn: () => executionApi.screenshot(id, token),
    enabled: !!id && !!token,
  });
  useEffect(() => {
    if (!image.data) return;
    const url = URL.createObjectURL(image.data);
    setResource({ id, url });
    return () => URL.revokeObjectURL(url);
  }, [id, image.data]);
  return (
    <figure>
      <figcaption>{label}</figcaption>
      {resource?.id === id ? (
        <img src={resource.url} alt={label} style={{ width: "100%" }} />
      ) : (
        <p>
          {image.error ? errorMessage(image.error) : "Loading protected image…"}
        </p>
      )}
    </figure>
  );
}
