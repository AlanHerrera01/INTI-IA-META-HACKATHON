import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Pause, ShieldCheck, Square, RefreshCw } from "lucide-react";
import { errorMessage } from "../services/api";
import { executionApi, mergeEvents } from "../services/executionApi";
import { Link } from "react-router-dom";
import { verificationApi } from "../services/verificationApi";
import { VerdictBadge } from "../features/verification/VerdictBadge";
import {
  terminal,
  type ActionContract,
  type ExecutionBundle,
  type ExecutionEvent,
} from "../types/execution";
import "../styles/execution.css";

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

export function ExecutionPage() {
  const [draftToken, setDraftToken] = useState("");
  const [token, setToken] = useState("");
  const [id, setId] = useState("");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<
    "plan" | "high_risk" | "cancel" | null
  >(null);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [connection, setConnection] = useState("Disconnected");
  const [planId, setPlanId] = useState("");
  const [contracts, setContracts] = useState("[]");
  const [mode, setMode] = useState("hybrid_dom");
  const query = useQueryClient();
  const history = useQuery({
    queryKey: ["executions", token, offset],
    queryFn: () => executionApi.history(token, offset),
    enabled: !!token,
    refetchInterval: 3000,
  });
  const execution = useQuery({
    queryKey: ["execution", token, id],
    queryFn: () => executionApi.get(id, token),
    enabled: !!token && !!id,
    refetchInterval: 1000,
  });
  const bundle = execution.data;
  const cursor = useRef(0);
  useEffect(() => {
    if (!id || !token) return;
    let stopped = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    cursor.current = 0;
    const append = (incoming: ExecutionEvent[]) => {
      if (stopped) return;
      for (const event of incoming)
        cursor.current = Math.max(cursor.current, event.sequence);
      setEvents((previous) => mergeEvents(previous, incoming));
      void query.invalidateQueries({ queryKey: ["execution", token, id] });
    };
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/executions/${id}`,
      );
      socket.onopen = () => {
        setConnection("Live stream");
        socket?.send(JSON.stringify({ token, after: cursor.current }));
      };
      socket.onmessage = (event) => {
        try {
          append([JSON.parse(event.data) as ExecutionEvent]);
        } catch {
          setConnection("Polling saved events");
        }
      };
      socket.onclose = (event) => {
        if (stopped) return;
        setConnection(
          event.code === 1000 ? "Saved event history" : "Polling saved events",
        );
        if (event.code !== 1000 && event.code !== 4401 && event.code !== 4403)
          retry = setTimeout(connect, 2000);
      };
      socket.onerror = () => setConnection("Polling saved events");
    };
    connect();
    const poll = setInterval(() => {
      void executionApi
        .events(id, token, cursor.current)
        .then(append)
        .catch(() => {
          if (!stopped) setConnection("Event connection unavailable");
        });
    }, 2000);
    void executionApi
      .events(id, token, 0)
      .then(append)
      .catch(() => {});
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(poll);
      socket?.close();
    };
  }, [id, token, query]);

  const select = (value: string) => {
    setEvents([]);
    setId(value);
    setError("");
    setConfirm(null);
  };
  const run = async (work: () => Promise<ExecutionBundle>) => {
    setBusy(true);
    setError("");
    try {
      const next = await work();
      if (next.session.id !== id) select(next.session.id);
      query.setQueryData(["execution", token, next.session.id], next);
      await query.invalidateQueries({ queryKey: ["executions"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const command = (name: string) =>
    id && void run(() => executionApi.command(id, token, name));
  const approve = () =>
    bundle &&
    void run(() =>
      executionApi.command(id, token, "approve", {
        manifest_digest: bundle.manifest.digest,
        scope: confirm,
        action_ids:
          confirm === "high_risk"
            ? bundle.manifest.actions
                .filter((a) => a.risk_level === "HIGH")
                .map((a) => a.id)
            : [],
      }),
    );
  return (
    <div className="execution-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AUTHORIZE · ACT · OBSERVE · RECORD</p>
          <h1>Live Execution</h1>
          <p>Authorized browser actions with persistent evidence.</p>
        </div>
        <span className="execution-chip">PHASE 03</span>
      </div>
      <form
        className="execution-auth"
        onSubmit={(e) => {
          e.preventDefault();
          setToken(draftToken);
          select("");
        }}
      >
        <label>
          Operator token
          <input
            type="password"
            autoComplete="off"
            value={draftToken}
            onChange={(e) => setDraftToken(e.target.value)}
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
          Kept in memory for this page. Configure EXECUTION_OPERATOR_TOKEN in
          your local .env.
        </small>
      </form>
      {(error || execution.error || history.error) && (
        <p role="alert" className="execution-error">
          {error || errorMessage(execution.error || history.error)}
        </p>
      )}
      <div className="execution-layout">
        <aside className="execution-panel">
          <h2>Execution history</h2>
          <button
            disabled={!token || busy}
            onClick={() => void run(() => executionApi.prepare(token))}
          >
            <RefreshCw size={15} /> Prepare PC-104 sandbox
          </button>
          <p className="execution-help">
            Authored demo recipe, validated against observed controls. No Meta
            inference. Requires PC-104 to be Inactive.
          </p>
          {busy && <p role="status">Processing request…</p>}
          {history.isFetching && <small>Refreshing history…</small>}
          {history.data?.items.length === 0 && <p>No executions recorded.</p>}
          <div className="execution-history">
            {history.data?.items.map((item) => (
              <button
                key={item.session.id}
                aria-pressed={id === item.session.id}
                onClick={() => select(item.session.id)}
              >
                <strong>{item.session.status}</strong>
                <span>{item.manifest.plan_snapshot.plan.goal}</span>
                <small>
                  {new Date(item.session.updated_at).toLocaleString()}
                </small>
              </button>
            ))}
          </div>
          <div className="execution-controls">
            <button
              disabled={offset === 0}
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
          <details>
            <summary>Load an existing validated plan</summary>
            <label>
              Plan ID
              <input
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              />
            </label>
            <label>
              Grounding mode
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option>hybrid_dom</option>
                <option>selector_based</option>
                <option>visual_only</option>
              </select>
            </label>
            <label>
              Typed action contracts (JSON)
              <textarea
                rows={8}
                value={contracts}
                onChange={(e) => setContracts(e.target.value)}
              />
            </label>
            <p className="execution-help">
              One exact target and typed pre/postcondition contract per action.
              See API documentation. Visual-only supports URL checks and fresh
              model coordinates; DOM assertions are rejected.
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
          </details>
        </aside>
        <section className="execution-main">
          {!bundle ? (
            <div className="execution-panel">
              <h2>Ready to connect</h2>
              <p>
                Connect with your operator token, then prepare a sandbox
                workflow or review a saved execution.
              </p>
            </div>
          ) : (
            <>
              <ExecutionDashboard bundle={bundle} />
              <ExecutionVerification id={bundle.session.id} token={token} />
              <div
                className="execution-panel execution-controls"
                aria-label="Execution controls"
              >
                <button
                  disabled={
                    busy ||
                    bundle.session.status !== "AWAITING_APPROVAL" ||
                    bundle.plan_approved
                  }
                  onClick={() => setConfirm("plan")}
                >
                  <ShieldCheck size={15} /> Approve Plan
                </button>
                <button
                  disabled={
                    busy ||
                    bundle.session.status !== "AWAITING_APPROVAL" ||
                    !bundle.plan_approved
                  }
                  onClick={() => setConfirm("high_risk")}
                >
                  Confirm HIGH actions
                </button>
                <button
                  disabled={busy || bundle.session.status !== "READY"}
                  onClick={() => command("start")}
                >
                  <Play size={15} /> Start Execution
                </button>
                <button
                  disabled={
                    busy ||
                    bundle.session.status !== "RUNNING" ||
                    bundle.session.pause_requested
                  }
                  onClick={() => command("pause")}
                >
                  <Pause size={15} />{" "}
                  {bundle.session.pause_requested ? "Pausing…" : "Pause"}
                </button>
                <button
                  disabled={busy || bundle.session.status !== "PAUSED"}
                  onClick={() => command("resume")}
                >
                  Resume
                </button>
                <button
                  disabled={busy || terminal.has(bundle.session.status)}
                  onClick={() => setConfirm("cancel")}
                >
                  <Square size={15} /> Cancel
                </button>
              </div>
              <BrowserViewer bundle={bundle} token={token} />
              <ActionTimeline bundle={bundle} />
              <details className="execution-panel">
                <summary>Execution inspector</summary>
                <dl className="execution-inspector">
                  <dt>Execution ID</dt>
                  <dd>{id}</dd>
                  <dt>Plan ID</dt>
                  <dd>{bundle.session.plan_id}</dd>
                  <dt>Browser session</dt>
                  <dd>{bundle.browser_session?.status ?? "Not opened"}</dd>
                  <dt>Grounding mode</dt>
                  <dd>{bundle.manifest.grounding_mode}</dd>
                  <dt>Manifest SHA-256</dt>
                  <dd>{bundle.manifest.digest}</dd>
                  <dt>Model metadata</dt>
                  <dd>
                    {bundle.manifest.plan_snapshot.model_usage
                      .map((m) => `${m.model} / ${m.response_id}`)
                      .join(", ") || "No model call — authored plan"}
                  </dd>
                  <dt>Failed actions</dt>
                  <dd>
                    {bundle.results.filter((r) => r.status === "FAILED").length}
                  </dd>
                </dl>
                <pre>{JSON.stringify(bundle.decisions, null, 2)}</pre>
              </details>
              <section className="execution-panel">
                <h2>
                  Event timeline <small>{connection}</small>
                </h2>
                <ol className="execution-events">
                  {events.map((event) => (
                    <li key={event.id}>
                      <time>
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </time>
                      <strong>{event.event_type}</strong>
                      <small>#{event.sequence}</small>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </section>
      </div>
      {confirm && bundle && (
        <div className="execution-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
            className="execution-panel execution-modal"
          >
            <h2 id="approval-title">
              {confirm === "cancel"
                ? "Cancel execution?"
                : confirm === "plan"
                  ? "Approve this exact plan?"
                  : "Confirm HIGH risk actions?"}
            </h2>
            <p>
              {confirm === "cancel"
                ? "Stop scheduling actions and close the browser. Completed application changes remain saved."
                : "Review the exact targets, parameters and immediate checks. Approval applies only to this manifest."}
            </p>
            <code>{bundle.manifest.digest}</code>
            {confirm !== "cancel" && (
              <pre>
                {JSON.stringify(
                  bundle.manifest.actions.filter(
                    (a) => confirm === "plan" || a.risk_level === "HIGH",
                  ),
                  null,
                  2,
                )}
              </pre>
            )}
            <div className="execution-controls">
              <button disabled={busy} onClick={() => setConfirm(null)}>
                Back to review
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  confirm === "cancel" ? command("cancel") : approve()
                }
              >
                Confirm {confirm === "high_risk" ? "HIGH actions" : confirm}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ExecutionVerification({ id, token }: { id: string; token: string }) {
  const history = useQuery({
    queryKey: ["execution-verifications", id, token],
    queryFn: () => verificationApi.list(token, 0, id),
    enabled: !!token,
    refetchInterval: 3000,
    retry: false,
  });
  const latest = history.data?.items[0];
  const report = useQuery({
    queryKey: ["execution-verification-report", latest?.session.id, token],
    queryFn: () => verificationApi.report(latest!.session.id, token),
    enabled: !!latest,
    refetchInterval: 3000,
    retry: false,
  });
  return (
    <section className="execution-panel">
      <h2>Independent task verification</h2>
      <VerdictBadge verdict={report.data?.effective_verdict} />
      <p>
        {history.error || report.error
          ? "Verification service unavailable. No outcome can be confirmed here."
          : "The saved action result and the persisted task outcome are evaluated separately."}
      </p>
      <Link to={`/verification?execution=${id}`}>Open Verification Center</Link>
      <p>
        <Link to="/recovery">Review recovery history</Link>
      </p>
    </section>
  );
}

export function ExecutionDashboard({ bundle }: { bundle: ExecutionBundle }) {
  const { session, manifest } = bundle;
  const completed = bundle.results.filter(
    (r) => r.status === "SUCCEEDED" || r.status === "SATISFIED",
  ).length;
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

function BrowserViewer({
  bundle,
  token,
}: {
  bundle: ExecutionBundle;
  token: string;
}) {
  const id = bundle.session.latest_observation_id;
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  const screenshot = useQuery({
    queryKey: ["execution-screenshot", token, id],
    queryFn: () => executionApi.screenshot(id!, token),
    enabled: !!id && !!token,
    gcTime: 0,
  });
  const observation = useQuery({
    queryKey: ["execution-observation", token, id],
    queryFn: () => executionApi.observation(id!, token),
    enabled: !!id && !!token,
    gcTime: 0,
  });
  useEffect(() => {
    if (!screenshot.data || !id) return;
    const url = URL.createObjectURL(screenshot.data);
    // Blob URLs are revoked when evidence changes or the viewer unmounts.
    setImage({ id, url });
    return () => URL.revokeObjectURL(url);
  }, [screenshot.data, id]);
  const viewport = bundle.manifest.viewport;
  const result = bundle.results.find((r) => r.before_observation_id === id);
  const box = result?.resolution?.bounding_box;
  return (
    <section className="execution-panel">
      <h2>
        Live browser{" "}
        <small>
          {viewport.width} × {viewport.height}
        </small>
      </h2>
      <p className="execution-url">
        {bundle.browser_session?.current_url || bundle.manifest.initial_url}
      </p>
      {image?.id === id ? (
        <div className="execution-screen">
          <img src={image.url} alt="Latest execution browser observation" />
          {box && (
            <span
              className="execution-target"
              style={{
                left: `${(box.x / viewport.width) * 100}%`,
                top: `${(box.y / viewport.height) * 100}%`,
                width: `${(box.width / viewport.width) * 100}%`,
                height: `${(box.height / viewport.height) * 100}%`,
              }}
            />
          )}
        </div>
      ) : (
        <p>
          {id
            ? "Loading protected screenshot…"
            : "A screenshot will appear after the browser opens."}
        </p>
      )}
      {screenshot.error && <p role="alert">{errorMessage(screenshot.error)}</p>}
      <small>
        {observation.data
          ? new Date(observation.data.timestamp).toLocaleString()
          : "No observation yet"}{" "}
        · {id || "—"}
      </small>
    </section>
  );
}

export function ActionTimeline({ bundle }: { bundle: ExecutionBundle }) {
  return (
    <section className="execution-panel">
      <h2>Action timeline</h2>
      <ol className="execution-actions">
        {bundle.manifest.actions.map((action, index) => {
          const result = bundle.results.find((r) => r.action_id === action.id);
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
