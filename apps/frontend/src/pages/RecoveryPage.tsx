import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Download,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Timer,
  Wrench,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { recoveryApi } from "../services/recoveryApi";
import { errorMessage } from "../services/api";
import { useOperator } from "../hooks/useOperator";
import { RecoveryOverview } from "../features/recovery/RecoveryOverview";
import { RecoveryEvidence } from "../features/recovery/RecoveryEvidence";
import { RecoveryPipeline } from "../features/recovery/RecoveryPipeline";
import {
  RecoveryAudit,
  RecoveryDiagnoses,
} from "../features/recovery/RecoveryAudit";
import { RecoveryTimeline } from "../features/recovery/RecoveryTimeline";
import { recoveryMetrics, recoveryStopped } from "../features/recovery/metrics";
import { downloadTaskJson } from "../features/tasks/records";
import type { RecoveryBundle } from "../types/recovery";
import "../styles/execution.css";
import "../styles/recovery-center.css";

export { RecoveryOverview };
type Review = {
  kind: "plan" | "high_risk" | "cancel" | "retry";
  snapshot: RecoveryBundle;
  digest: string | null;
};

export function RecoveryPage() {
  const [draft, setDraft] = useState("");
  const { token, setToken } = useOperator();
  const [search, setSearch] = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const client = useQueryClient();
  const history = useQuery({
    queryKey: ["recoveries", token, offset],
    queryFn: () => recoveryApi.list(token, offset),
    enabled: !!token,
    refetchInterval: 2000,
  });
  const records = token && !history.error ? (history.data?.items ?? []) : [];
  const id = search.get("recovery") || records[0]?.session.id || "";
  const selected = useQuery({
    queryKey: ["recovery", token, id],
    queryFn: () => recoveryApi.get(id, token),
    enabled: !!token && !!id,
    refetchInterval: 1000,
    retry: false,
  });
  const mismatch = !!selected.data && selected.data.session.id !== id;
  const bundle =
    token && !selected.error && !mismatch ? selected.data : undefined;
  const metrics = recoveryMetrics(records);
  const loaded = !!token && !!history.data && !history.error;
  const select = (value: string) => {
    setSearch(value ? { recovery: value } : {});
    setReview(null);
    setError("");
  };
  const run = async (work: () => Promise<RecoveryBundle>) => {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      if (result.session.id !== id)
        throw new Error("Recovery response did not match the selected case.");
      client.setQueryData(["recovery", token, id], result);
      await client.invalidateQueries({ queryKey: ["recoveries"] });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setReview(null);
    }
  };
  const request = (kind: Review["kind"]) => {
    if (bundle)
      setReview({
        kind,
        snapshot: bundle,
        digest: bundle.plan?.digest ?? null,
      });
  };
  const sameCase =
    !!review && !!bundle && review.snapshot.session.id === bundle.session.id;
  const samePlan =
    sameCase && !!review?.digest && review.digest === bundle?.plan?.digest;
  const canConfirm =
    !busy &&
    !!token &&
    sameCase &&
    (review?.kind === "cancel"
      ? !recoveryStopped.has(bundle!.session.status)
      : review?.kind === "retry"
        ? bundle!.session.status === "ESCALATED" &&
          bundle!.session.retry_allowed
        : samePlan &&
          bundle!.session.status === "AWAITING_APPROVAL" &&
          (review?.kind === "plan"
            ? !bundle!.plan_approved
            : bundle!.plan_approved));
  const confirm = () => {
    if (!review || !canConfirm) return;
    if (review.kind === "cancel" || review.kind === "retry") {
      const kind = review.kind;
      void run(() =>
        recoveryApi.control(review.snapshot.session.id, kind, token),
      );
    } else {
      const scope = review.kind;
      void run(() =>
        recoveryApi.approve(
          review.snapshot,
          token,
          scope,
          scope === "high_risk"
            ? review.snapshot
                .plan!.actions.filter((action) => action.risk_level === "HIGH")
                .map((action) => action.id)
            : [],
        ),
      );
    }
  };
  const refresh = () => {
    void history.refetch();
    if (id) void selected.refetch();
  };
  return (
    <div className="execution-workspace recovery-center-workspace">
      <header className="recovery-center-heading">
        <div>
          <div className="recovery-heading-tags">
            <span>SELF-HEALING ENGINE</span>
            <small>BOUNDED RECOVERY</small>
          </div>
          <h1>Recovery Center</h1>
          <p>
            Inspect interface failures, evidence-backed repair proposals and
            renewed authorization.
          </p>
        </div>
        <div className="recovery-protocol-badge">
          <Wrench size={25} />
          <div>
            <span>EVIDENCE &amp; POLICY</span>
            <strong>
              {bundle
                ? bundle.session.status.replaceAll("_", " ")
                : "Waiting for evidence"}
            </strong>
          </div>
        </div>
      </header>
      <div className="recovery-center-metrics">
        <section aria-label="Stored recoveries">
          <header>
            <Activity size={16} />
            <h2>RECORDED RECOVERIES</h2>
            <span>STORED TOTAL</span>
          </header>
          <strong>
            {history.error ? "Unavailable" : loaded ? history.data!.total : "—"}
          </strong>
          <p>Persistent recovery sessions, not simulated incidents.</p>
        </section>
        <section aria-label="Recovery rate on loaded page">
          <header>
            <ShieldCheck size={16} />
            <h2>RECOVERY RATE</h2>
            <span>LOADED PAGE</span>
          </header>
          <strong>
            {!loaded || metrics.rate === null
              ? "Unavailable"
              : `${metrics.rate.toFixed(1)}%`}
          </strong>
          <p>
            {loaded
              ? `${metrics.recovered} recovered / ${metrics.resolved} recovered or failed records.`
              : "Connect to inspect recorded outcomes."}
          </p>
        </section>
        <section aria-label="Mean recorded recovery duration">
          <header>
            <Timer size={16} />
            <h2>MEAN SESSION TIME</h2>
            <span>RECORDED</span>
          </header>
          <strong>
            {!loaded || metrics.meanMs === null
              ? "Unavailable"
              : `${metrics.meanMs.toFixed(0)} ms`}
          </strong>
          <p>
            {loaded
              ? `${metrics.durationSamples} valid closed-session duration samples.`
              : "No duration samples loaded."}
          </p>
        </section>
        <section aria-label="Escalated recoveries on loaded page">
          <header>
            <Gauge size={16} />
            <h2>ESCALATED CASES</h2>
            <span>LOADED PAGE</span>
          </header>
          <strong>{loaded ? metrics.escalated : "—"}</strong>
          <p>Requires review of policy, evidence and remaining budget.</p>
        </section>
      </div>
      <div className="recovery-session-toolbar">
        <details className="recovery-operator" open={!token}>
          <summary>
            <ShieldCheck size={14} />
            {token ? "Operator connected" : "Connect operator"}
          </summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setToken(draft);
              setDraft("");
              setReview(null);
            }}
          >
            <label>
              Operator token
              <input
                type="password"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <button disabled={!draft}>Connect</button>
            {token && (
              <button
                type="button"
                onClick={() => {
                  setToken("");
                  setDraft("");
                  select("");
                  client.removeQueries({ queryKey: ["recovery"] });
                  client.removeQueries({ queryKey: ["recoveries"] });
                }}
              >
                Disconnect
              </button>
            )}
            <small>
              Capability stays in memory. Expanded scope requires explicit
              approval.
            </small>
          </form>
        </details>
        <label>
          Recovery history
          <select
            aria-label="Recovery history"
            value={id}
            disabled={!token || !records.length || busy}
            onChange={(event) => select(event.target.value)}
          >
            {!id && (
              <option value="">
                {token ? "No recovery records yet" : "Connect to load history"}
              </option>
            )}
            {id && !records.some((record) => record.session.id === id) && (
              <option value={id}>Requested #{id.slice(0, 8)}</option>
            )}
            {records.map((record) => (
              <option key={record.session.id} value={record.session.id}>
                {record.session.status} · {record.session.initial_failure_type}{" "}
                · #{record.session.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <div className="recovery-history-buttons">
          <button
            disabled={!token || offset === 0 || history.isFetching}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous
          </button>
          <button
            disabled={
              !loaded ||
              offset + 20 >= (history.data?.total || 0) ||
              history.isFetching
            }
            onClick={() => setOffset(offset + 20)}
          >
            Next
          </button>
          <button
            aria-label="Refresh recovery history"
            disabled={!token || history.isFetching || selected.isFetching}
            onClick={refresh}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <small>
          Page {Math.floor(offset / 20) + 1} · {records.length} loaded · metrics
          apply to this page
        </small>
      </div>
      {(error || history.error || selected.error || mismatch) && (
        <p role="alert" className="execution-error">
          {error ||
            (mismatch
              ? "The returned recovery does not match the selected case."
              : errorMessage(history.error || selected.error))}
        </p>
      )}
      {busy && (
        <p role="status" className="recovery-small-note">
          Processing explicit request…
        </p>
      )}
      {!bundle && (
        <p className="recovery-empty-notice">
          {!token
            ? "Connect your local operator to inspect protected recovery evidence."
            : history.isPending || (id && selected.isPending)
              ? "Loading saved recovery records…"
              : history.error || selected.error || mismatch
                ? "Recovery evidence is unavailable. Refresh or select another case."
                : "No recovery records yet. Recovery begins after a structured execution failure; this workspace does not generate a case automatically."}
        </p>
      )}
      <section
        className="recovery-case"
        aria-label="Recovery evidence comparison"
      >
        <header className="recovery-case-heading">
          <div>
            <Wrench size={21} />
            <div>
              <h2>
                {bundle
                  ? `Recorded Recovery Case #${bundle.session.id.slice(0, 8)}`
                  : "Recovery Case · No record selected"}
              </h2>
              <p>
                {bundle
                  ? `${bundle.session.initial_failure_type} · execution #${bundle.session.execution_id.slice(0, 8)}`
                  : "Baseline, diagnosis and fresh evidence appear here when recorded."}
              </p>
            </div>
          </div>
          <div>
            <span
              className={`recovery-case-state recovery-state-${bundle?.session.status.toLowerCase() || "empty"}`}
            >
              {bundle?.session.status.replaceAll("_", " ") ||
                "AWAITING EVIDENCE"}
            </span>
            <button
              disabled={!bundle}
              onClick={() =>
                bundle &&
                downloadTaskJson(
                  `inti-recovery-${bundle.session.id}.json`,
                  bundle,
                )
              }
            >
              <Download size={13} />
              Export record
            </button>
          </div>
        </header>
        <div className="recovery-comparison-grid">
          <RecoveryEvidence
            key={
              (bundle?.context.previous_observation_id || "before-empty") +
              token
            }
            id={bundle?.context.previous_observation_id}
            token={token}
            label="Captured baseline"
          />
          <RecoveryPipeline bundle={bundle} />
          <RecoveryEvidence
            key={
              (bundle?.session.evidence_ids.at(-1) ||
                bundle?.context.current_observation_id ||
                "after-empty") + token
            }
            id={
              bundle?.session.evidence_ids.at(-1) ||
              bundle?.context.current_observation_id
            }
            token={token}
            label="Fresh recovery observation"
          />
        </div>
        <div className="recovery-case-controls">
          <div>
            <button
              disabled={
                busy || !bundle || recoveryStopped.has(bundle.session.status)
              }
              onClick={() => request("cancel")}
            >
              Cancel recovery and execution
            </button>
            <button
              disabled={
                busy ||
                bundle?.session.status !== "ESCALATED" ||
                !bundle.session.retry_allowed
              }
              onClick={() => request("retry")}
            >
              Retry within remaining budget
            </button>
          </div>
          <Link
            to={
              bundle
                ? `/execution?execution=${bundle.session.execution_id}`
                : "/execution"
            }
          >
            Inspect original execution →
          </Link>
        </div>
      </section>
      <div className="recovery-lower-grid">
        <div className="recovery-left-column">
          <RecoveryTimeline
            key={(bundle?.session.id || "none") + token}
            bundle={bundle}
            token={token}
          />
          <RecoveryDiagnoses bundle={bundle} />
        </div>
        <RecoveryAudit bundle={bundle} />
      </div>
      <section className="recovery-repair-plan" aria-label="Proposed repair">
        <header>
          <h2>Proposed Repair &amp; Authorization</h2>
          <span>{bundle?.plan ? "SCOPED MANIFEST" : "NO REPAIR PROPOSED"}</span>
        </header>
        {bundle?.plan ? (
          <>
            <p>{bundle.plan.objective}</p>
            <p>{bundle.plan.decision.justification}</p>
            <code className="recovery-plan-digest">{bundle.plan.digest}</code>
            <ol>
              {bundle.plan.actions.map((action) => (
                <li key={action.id}>
                  <strong>
                    {action.action_type} · {action.risk_level}
                  </strong>
                  <span>{action.target?.name || "Page"}</span>
                  <details>
                    <summary>Parameters and assertions</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          target: action.target,
                          parameters: action.parameters,
                          preconditions: action.preconditions,
                          postconditions: action.expected_postconditions,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </li>
              ))}
            </ol>
            <div className="recovery-approval-buttons">
              <button
                disabled={
                  busy ||
                  bundle.session.status !== "AWAITING_APPROVAL" ||
                  bundle.plan_approved
                }
                onClick={() => request("plan")}
              >
                Review plan approval
              </button>
              <button
                disabled={
                  busy ||
                  bundle.session.status !== "AWAITING_APPROVAL" ||
                  !bundle.plan_approved ||
                  !bundle.plan.actions.some(
                    (action) => action.risk_level === "HIGH",
                  )
                }
                onClick={() => request("high_risk")}
              >
                Review HIGH risk actions
              </button>
            </div>
          </>
        ) : (
          <p>
            No bounded repair plan is recorded. A proposal will show its
            objective, targets, parameters and immediate checks before any
            renewed approval.
          </p>
        )}
      </section>
      {bundle && (
        <details className="recovery-budget-details">
          <summary>Budget and token ledger</summary>
          <RecoveryOverview bundle={bundle} />
        </details>
      )}
      <p className="recovery-center-footnote">
        Recovered means the interrupted action's checks passed. Independent
        verification determines task success. No replay, repair or model call
        starts from inspecting this page.
      </p>
      {review && (
        <div className="execution-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Confirm recovery authorization"
            className="execution-panel execution-modal"
          >
            <h2>
              {review.kind === "cancel"
                ? "Cancel recovery and execution?"
                : review.kind === "retry"
                  ? "Retry within the remaining budget?"
                  : review.kind === "high_risk"
                    ? "Authorize HIGH risk repair actions?"
                    : "Authorize this exact repair plan?"}
            </h2>
            <p>
              {review.kind === "cancel"
                ? "Stop scheduling recovery actions and cancel the execution. Changes already persisted remain saved."
                : review.kind === "retry"
                  ? "Request another bounded diagnosis attempt using the remaining recovery budget. This does not expand approved scope."
                  : "Approval binds only the displayed recovery manifest, targets, parameters and assertions."}
            </p>
            {review.digest && (
              <code className="recovery-plan-digest">{review.digest}</code>
            )}
            {(review.kind === "plan" || review.kind === "high_risk") && (
              <pre>
                {JSON.stringify(
                  review.snapshot.plan?.actions.filter(
                    (action) =>
                      review.kind !== "high_risk" ||
                      action.risk_level === "HIGH",
                  ),
                  null,
                  2,
                )}
              </pre>
            )}
            {!canConfirm && !busy && (
              <p role="alert" className="execution-error">
                The recovery, manifest or allowed action changed. Return to
                review before authorizing.
              </p>
            )}
            <div className="execution-controls">
              <button disabled={!canConfirm} onClick={confirm}>
                Confirm authorization
              </button>
              <button disabled={busy} onClick={() => setReview(null)}>
                Back
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
