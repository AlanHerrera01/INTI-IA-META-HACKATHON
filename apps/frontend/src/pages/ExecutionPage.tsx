import { Component, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, RefreshCw, ShieldCheck, Square } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../services/api";
import { executionApi } from "../services/executionApi";
import { useOperator } from "../hooks/useOperator";
import { useExecutionEvents } from "../hooks/useExecutionEvents";
import { ExecutionBrowser } from "../features/execution/ExecutionBrowser";
import { ExecutionStream } from "../features/execution/ExecutionStream";
import { ExecutionPanels } from "../features/execution/ExecutionPanels";
import { ExecutionVerification } from "../features/execution/ExecutionVerification";
import {
  ExecutionDashboard,
  ActionTimeline,
} from "../features/execution/ExecutionAudit";
import { executionMetrics } from "../features/execution/metrics";
import {
  terminal,
  type ActionContract,
  type ExecutableAction,
  type ExecutionBundle,
} from "../types/execution";
import "../styles/execution.css";
import "../styles/live-execution.css";

export { ExecutionDashboard, ActionTimeline };

export class ExecutionBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert">
        Execution workspace could not render. Reload the page to reconnect to
        saved state.
      </div>
    ) : (
      this.props.children
    );
  }
}

type Confirmation = {
  kind: "plan" | "high_risk" | "cancel";
  digest: string;
  executionId: string;
  actions: ExecutableAction[];
};

export function ExecutionPage() {
  const [search, setSearch] = useSearchParams();
  const { token, setToken } = useOperator();
  const [draftToken, setDraftToken] = useState("");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [planId, setPlanId] = useState(() => search.get("plan") || "");
  const [contracts, setContracts] = useState("[]");
  const [mode, setMode] = useState("hybrid_dom");
  const [focus, setFocus] = useState<{
    executionId: string;
    actionId: string;
  } | null>(null);
  const query = useQueryClient();
  const history = useQuery({
    queryKey: ["executions", token, offset],
    queryFn: () => executionApi.history(token, offset),
    enabled: !!token,
    refetchInterval: 3000,
  });
  const id =
    search.get("execution") ||
    (!search.get("plan") ? history.data?.items[0]?.session.id : "") ||
    "";
  const execution = useQuery({
    queryKey: ["execution", token, id],
    queryFn: () => executionApi.get(id, token),
    enabled: !!token && !!id,
    refetchInterval: 1000,
  });
  const bundle = token ? execution.data : undefined;
  const stream = useExecutionEvents(id, token, () => {
    void query.invalidateQueries({ queryKey: ["execution", token, id] });
  });
  const metrics = bundle ? executionMetrics(bundle) : null;
  const action =
    bundle?.manifest.actions.find(
      (item) => focus?.executionId === id && item.id === focus.actionId,
    ) ||
    bundle?.manifest.actions[
      Math.min(
        bundle.session.current_action_index,
        bundle.manifest.actions.length - 1,
      )
    ];
  const select = (value: string) => {
    setSearch(value ? { execution: value } : {});
    setError("");
    setConfirm(null);
    setFocus(null);
  };
  const run = async (work: () => Promise<ExecutionBundle>) => {
    setBusy(true);
    setError("");
    try {
      const next = await work();
      if (next.session.id !== id) select(next.session.id);
      query.setQueryData(["execution", token, next.session.id], next);
      await query.invalidateQueries({ queryKey: ["executions"] });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const command = (name: string) => {
    if (id && token) void run(() => executionApi.command(id, token, name));
  };
  const requestConfirmation = (kind: Confirmation["kind"]) => {
    if (!bundle) return;
    setConfirm({
      kind,
      digest: bundle.manifest.digest,
      executionId: id,
      actions: bundle.manifest.actions.filter(
        (item) => kind !== "high_risk" || item.risk_level === "HIGH",
      ),
    });
  };
  const exactManifest =
    !!confirm &&
    !!bundle &&
    confirm.executionId === id &&
    confirm.digest === bundle.manifest.digest;
  const approve = () => {
    if (!confirm || !exactManifest || !token) return;
    if (confirm.kind === "cancel") {
      command("cancel");
      return;
    }
    void run(() =>
      executionApi.command(confirm.executionId, token, "approve", {
        manifest_digest: confirm.digest,
        scope: confirm.kind,
        action_ids:
          confirm.kind === "high_risk"
            ? confirm.actions.map((item) => item.id)
            : [],
      }),
    );
  };
  return (
    <div className="execution-workspace live-workspace">
      <header className="live-command-heading">
        <div>
          <div className="live-heading-tags">
            <span>AUTONOMOUS VISUAL AGENTIC LOOP</span>
            <small>SEE · REASON · ACT · VERIFY</small>
          </div>
          {bundle?.session.status === "RECOVERING" && (
            <span className="live-recovery-alert">RECOVERY IN PROGRESS</span>
          )}
          <h1>Live Execution</h1>
          <p>
            {bundle && terminal.has(bundle.session.status)
              ? "Inspect a saved execution, its browser evidence and independent outcome."
              : "Watch authorized browser actions, recorded evidence and policy gates in one workspace."}
          </p>
        </div>
        <div className="live-heading-runtime">
          <div className="live-header-facts">
            <div>
              <small>RECORDED ELAPSED</small>
              <strong>
                {metrics?.elapsed != null
                  ? `${metrics.elapsed.toFixed(1)}s`
                  : "Unavailable"}
              </strong>
            </div>
            <div>
              <small>MEAN ACTION TIME</small>
              <strong>
                {metrics?.averageActionMs != null
                  ? `${metrics.averageActionMs.toFixed(0)} ms`
                  : "Unavailable"}
              </strong>
            </div>
            <div>
              <small>GROUNDING MODE</small>
              <strong>
                {bundle?.manifest.grounding_mode.replaceAll("_", " ") ||
                  "Not selected"}
              </strong>
            </div>
          </div>
          <div className="live-heading-controls">
            <button
              disabled={
                busy ||
                !bundle ||
                bundle.session.status !== "RUNNING" ||
                bundle.session.pause_requested
              }
              onClick={() => command("pause")}
            >
              <Pause size={15} />
              {bundle?.session.pause_requested ? "Pausing…" : "Pause"}
            </button>
            <button
              disabled={busy || bundle?.session.status !== "PAUSED"}
              onClick={() => command("resume")}
            >
              <Play size={15} />
              Resume
            </button>
          </div>
        </div>
      </header>
      <div className="live-session-toolbar">
        <details className="live-operator-connection" open={!token}>
          <summary>
            <ShieldCheck size={14} />
            Operator {token ? "connected" : "connection required"}
          </summary>
          <form
            className="live-operator-form"
            onSubmit={(event) => {
              event.preventDefault();
              setToken(draftToken);
              setDraftToken("");
            }}
          >
            <label>
              Operator token
              <input
                type="password"
                autoComplete="off"
                value={draftToken}
                onChange={(event) => setDraftToken(event.target.value)}
                placeholder="Local execution capability"
              />
            </label>
            <button disabled={!draftToken || busy}>Connect</button>
            {token && (
              <button
                type="button"
                onClick={() => {
                  setToken("");
                  setDraftToken("");
                  select("");
                  query.removeQueries({ queryKey: ["execution"] });
                  query.removeQueries({ queryKey: ["executions"] });
                }}
              >
                Disconnect
              </button>
            )}
            <small>
              Capability stays in memory for this session. Approvals remain
              explicit.
            </small>
          </form>
        </details>
        <label className="live-history-picker">
          Saved execution
          <select
            aria-label="Saved execution"
            value={id}
            disabled={!token || history.isPending || busy}
            onChange={(event) => select(event.target.value)}
          >
            {!id && (
              <option value="">
                {token ? "No execution selected" : "Connect to load history"}
              </option>
            )}
            {id &&
              !history.data?.items.some((item) => item.session.id === id) && (
                <option value={id}>Requested #{id.slice(0, 8)}</option>
              )}
            {history.data?.items.map((item) => (
              <option key={item.session.id} value={item.session.id}>
                {item.session.status} · #{item.session.id.slice(0, 8)} ·{" "}
                {new Date(item.session.updated_at).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <div className="live-history-controls">
          <button
            aria-label="Previous execution page"
            disabled={!token || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous
          </button>
          <button
            aria-label="Next execution page"
            disabled={
              !token || !history.data || offset + 20 >= history.data.total
            }
            onClick={() => setOffset(offset + 20)}
          >
            Next
          </button>
          <button
            aria-label="Refresh execution"
            disabled={!token || history.isFetching || execution.isFetching}
            onClick={() => {
              void history.refetch();
              if (id) void execution.refetch();
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <Link to="/missions/new?compose=1">Create a task →</Link>
      </div>
      {(error || execution.error || history.error) && (
        <p role="alert" className="execution-error">
          {error || errorMessage(execution.error || history.error)}
        </p>
      )}
      {busy && (
        <p role="status" className="live-small-note">
          Processing explicit request…
        </p>
      )}
      {bundle ? (
        <>
          <div className="live-command-layout">
            <aside className="live-left-column">
              <ExecutionStream
                key={id + token}
                bundle={bundle}
                selected={action?.id || ""}
                onSelect={(actionId) => setFocus({ executionId: id, actionId })}
                events={stream.events}
                connection={stream.connection}
              />
            </aside>
            <section className="live-center-column">
              <ExecutionBrowser
                key={id + token}
                bundle={bundle}
                token={token}
              />
              <section
                className="live-progress-card"
                aria-label="Execution controls"
              >
                <div className="live-progress-heading">
                  <strong>
                    {metrics?.completed} / {bundle.manifest.actions.length}{" "}
                    approved steps complete
                  </strong>
                  <span
                    className={`state-${bundle.session.status.toLowerCase()}`}
                  >
                    {bundle.session.status.replaceAll("_", " ")}
                  </span>
                </div>
                <progress
                  aria-label="Approved action progress"
                  max={bundle.manifest.actions.length || 1}
                  value={metrics?.completed || 0}
                />
                <p className="live-small-note">
                  Step completion and persisted task success are evaluated
                  separately.
                </p>
                <div className="execution-controls live-approval-controls">
                  <button
                    disabled={
                      busy ||
                      bundle.session.status !== "AWAITING_APPROVAL" ||
                      bundle.plan_approved
                    }
                    onClick={() => requestConfirmation("plan")}
                  >
                    <ShieldCheck size={14} />
                    Approve Plan
                  </button>
                  <button
                    disabled={
                      busy ||
                      bundle.session.status !== "AWAITING_APPROVAL" ||
                      !bundle.plan_approved
                    }
                    onClick={() => requestConfirmation("high_risk")}
                  >
                    Confirm HIGH actions
                  </button>
                  <button
                    className="live-start"
                    disabled={busy || bundle.session.status !== "READY"}
                    onClick={() => command("start")}
                  >
                    <Play size={14} />
                    Start Execution
                  </button>
                </div>
              </section>
              <details className="live-audit-details">
                <summary>Execution summary and action evidence</summary>
                <ExecutionDashboard bundle={bundle} />
                <ActionTimeline bundle={bundle} />
              </details>
              <details className="live-audit-details">
                <summary>Execution inspector</summary>
                <dl className="execution-inspector">
                  <dt>Execution ID</dt>
                  <dd>{id}</dd>
                  <dt>Plan ID</dt>
                  <dd>{bundle.session.plan_id}</dd>
                  <dt>Manifest SHA-256</dt>
                  <dd>{bundle.manifest.digest}</dd>
                  <dt>Browser session</dt>
                  <dd>{bundle.browser_session?.status || "Not opened"}</dd>
                  <dt>Model provenance</dt>
                  <dd>
                    {bundle.manifest.plan_snapshot.model_usage
                      .map((item) => `${item.model} / ${item.response_id}`)
                      .join(", ") || "No model call — authored plan"}
                  </dd>
                </dl>
                <pre>{JSON.stringify(bundle.decisions, null, 2)}</pre>
              </details>
            </section>
            <aside className="live-right-column">
              <ExecutionPanels bundle={bundle} action={action} />
              <ExecutionVerification id={id} token={token} />
              <button
                className="live-cancel"
                disabled={busy || terminal.has(bundle.session.status)}
                onClick={() => requestConfirmation("cancel")}
              >
                <Square size={15} />
                Cancel execution
              </button>
            </aside>
          </div>
          <p className="live-workspace-footnote">
            #{id.slice(0, 8)} · {stream.connection}. Saved captures and events
            are evidence, not a continuous video stream.
          </p>
        </>
      ) : (
        <section className="live-empty-state">
          <ShieldCheck size={34} />
          <h2>
            {!token
              ? "Ready to connect"
              : execution.isPending && id
                ? "Loading execution…"
                : "No execution selected"}
          </h2>
          <p>
            {!token
              ? "Connect your local operator to inspect saved executions or authorize a workflow."
              : history.data?.total === 0
                ? "No executions recorded. Create a task or explicitly prepare the authored sandbox below."
                : "Select a saved execution or prepare an approved workflow."}
          </p>
        </section>
      )}
      <details className="live-prepare-details">
        <summary>Prepare a workflow</summary>
        <div className="live-prepare-grid">
          <div>
            <h2>Authored sandbox recipe</h2>
            <p>
              Validated controls for PC-104. No Meta inference. Requires PC-104
              to be Inactive. Preparation does not start execution.
            </p>
            <button
              disabled={!token || busy}
              onClick={() => void run(() => executionApi.prepare(token))}
            >
              <RefreshCw size={14} />
              Prepare PC-104 sandbox
            </button>
          </div>
          <div>
            <h2>Load an existing validated plan</h2>
            <label>
              Plan ID
              <input
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
              />
            </label>
            <label>
              Grounding mode
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option>hybrid_dom</option>
                <option>selector_based</option>
                <option>visual_only</option>
              </select>
            </label>
            <label>
              Typed action contracts (JSON)
              <textarea
                rows={5}
                value={contracts}
                onChange={(event) => setContracts(event.target.value)}
              />
            </label>
            <p>
              Exact typed target and pre/postcondition contracts remain subject
              to backend validation.
            </p>
            <button
              disabled={!token || !planId || busy}
              onClick={() =>
                void run(() =>
                  executionApi.create(
                    token,
                    planId,
                    JSON.parse(contracts) as ActionContract[],
                    mode,
                  ),
                )
              }
            >
              Prepare execution
            </button>
          </div>
        </div>
      </details>
      {confirm && bundle && (
        <div className="execution-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
            className="execution-panel execution-modal"
          >
            <h2 id="approval-title">
              {confirm.kind === "cancel"
                ? "Cancel execution?"
                : confirm.kind === "plan"
                  ? "Approve this exact plan?"
                  : "Confirm HIGH risk actions?"}
            </h2>
            <p>
              {confirm.kind === "cancel"
                ? "Stop scheduling actions and close the browser. Completed application changes remain saved."
                : "Review the exact targets, parameters and immediate checks. Approval applies only to this manifest."}
            </p>
            <code>{confirm.digest}</code>
            {confirm.kind !== "cancel" && (
              <pre>{JSON.stringify(confirm.actions, null, 2)}</pre>
            )}
            {!exactManifest && (
              <p role="alert" className="execution-error">
                The selected execution or manifest changed. Return to review.
              </p>
            )}
            <div className="execution-controls">
              <button disabled={busy} onClick={() => setConfirm(null)}>
                Back to review
              </button>
              <button
                disabled={
                  busy ||
                  !exactManifest ||
                  (confirm.kind === "cancel" &&
                    terminal.has(bundle.session.status))
                }
                onClick={approve}
              >
                Confirm{" "}
                {confirm.kind === "high_risk" ? "HIGH actions" : confirm.kind}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
