import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Circle,
  Clock3,
  Compass,
  Cpu,
  Database,
  Gauge,
  GitBranch,
  History,
  Layers3,
  ListChecks,
  Monitor,
  PlayCircle,
  Plus,
  ScanLine,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { OperatorConnection } from "../components/OperatorConnection";
import { useOperator } from "../hooks/useOperator";
import { useModel, useSystem } from "../hooks/useSystem";
import { missionApi } from "../services/missionApi";
import { executionApi } from "../services/executionApi";
import { recoveryApi } from "../services/recoveryApi";
import { verificationApi } from "../services/verificationApi";
import { errorMessage } from "../services/api";
import {
  durationLabel,
  executionSeconds,
  summarizeExecutions,
} from "../features/overview/metrics";
import type { ExecutionBundle } from "../types/execution";
import type { Verdict } from "../types/verification";
import "../styles/overview.css";

export function Overview() {
  const { token } = useOperator();
  const [search] = useSearchParams();
  const location = useLocation();
  const connectionDialog = useRef<HTMLDialogElement>(null);
  const system = useSystem();
  const model = useModel();
  const overview = useQuery({
    queryKey: ["mission-control", token],
    queryFn: () => missionApi.overview(token),
    enabled: !!token,
    refetchInterval: 5000,
  });
  const executions = overview.data?.executions ?? [];
  const latest = executions[0];
  const summary = summarizeExecutions(executions);
  const latestVerification = overview.data?.recent_verifications.find(
    (verification) => verification.session.execution_id === latest?.session.id,
  );
  const report = useQuery({
    queryKey: ["overview-verification", token, latestVerification?.session.id],
    queryFn: () =>
      verificationApi.report(latestVerification!.session.id, token),
    enabled: !!token && !!latestVerification,
    staleTime: 15000,
  });
  const recoveries = useQuery({
    queryKey: ["overview-recoveries", token],
    queryFn: () => recoveryApi.list(token),
    enabled: !!token && !!overview.data?.features.recovery_enabled,
    refetchInterval: 10000,
    retry: false,
  });
  const authored = latest
    ? latest.manifest.plan_snapshot.model_usage.length === 0
    : false;
  const executionLink = latest
    ? `/execution?execution=${latest.session.id}`
    : "/execution";

  useEffect(() => {
    if (search.get("connect") === "1" && !connectionDialog.current?.open)
      connectionDialog.current?.showModal();
  }, [search, location.key]);

  return (
    <div className="overview-workspace">
      <section className="overview-welcome" aria-labelledby="overview-title">
        <div className="overview-welcome-copy">
          <div className="overview-sun">
            <img
              src="/brand/inti-ai-logo-v1.png"
              width="36"
              height="36"
              alt=""
            />
          </div>
          <div>
            <div className="overview-title-row">
              <h1 id="overview-title">Welcome to INTI AI</h1>
              <span className="overview-label">
                LOCAL v{system.data?.version ?? "0.7.0"}
              </span>
            </div>
            <p>
              Your visual intelligence command center. Authorized browser
              actions and independent outcome verification.
            </p>
            {!token && (
              <button
                className="overview-connect"
                onClick={() => connectionDialog.current?.showModal()}
              >
                Connect operator to load your workspace{" "}
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="overview-welcome-actions">
          <Link className="button secondary" to={executionLink}>
            <PlayCircle size={17} aria-hidden="true" />
            View Live Execution
          </Link>
          <Link className="button solar-button" to="/missions/new?compose=1">
            <Plus size={17} aria-hidden="true" />
            Create New Task
          </Link>
        </div>
      </section>
      {(overview.error || system.error || model.error) && (
        <p role="alert" className="overview-error">
          {errorMessage(overview.error || system.error || model.error)}
        </p>
      )}
      <div className="overview-stat-grid">
        <Metric
          label="Total tasks"
          value={overview.data?.mission_count ?? "—"}
          tag="STORED"
          note="Persistent mission history"
          icon={<ListChecks size={15} />}
        />
        <Metric
          label="Successful executions"
          value={overview.data ? summary.completed : "—"}
          tag="RECENT RUNS"
          note={
            overview.data
              ? `${summary.completed} of ${summary.loaded} loaded runs completed; outcomes verified separately`
              : "Connect to inspect completed steps"
          }
          tone="green"
          icon={<CheckCircle2 size={15} />}
        />
        <Metric
          label="Recovery success rate"
          value="—"
          tag="UNMEASURED"
          note="No recovery-rate benchmark available"
          tone="gold"
          icon={<Wrench size={15} />}
        />
        <Metric
          label="Avg execution time"
          value={durationLabel(summary.meanSeconds)}
          tag="RECENT RUNS"
          note={
            summary.durations.length
              ? `Mean of ${summary.durations.length} completed runs with valid timestamps`
              : "No completed duration samples"
          }
          icon={<Clock3 size={15} />}
        >
          <DurationTrend values={[...summary.durations].reverse()} />
        </Metric>
      </div>
      <div className="overview-columns">
        <div className="overview-primary">
          <section className="overview-panel overview-pipeline">
            <PanelHeading
              icon={<GitBranch size={18} />}
              title="Active Autonomous Pipeline Architecture"
            >
              <span className="overview-label">
                {latest ? "LATEST SAVED RUN" : "AWAITING A RUN"}
              </span>
            </PanelHeading>
            <div className="overview-loop">
              <PipelineStep
                index="01"
                label="PERCEIVE"
                title="Browser observation"
                note={
                  latest?.session.latest_observation_id
                    ? "Captured viewport"
                    : "No frame captured"
                }
                state={
                  latest?.session.latest_observation_id ? "done" : "waiting"
                }
              />
              <PipelineStep
                index="02"
                label="REASON"
                title={
                  latest
                    ? authored
                      ? "Authored plan"
                      : "Meta planning"
                    : "No plan selected"
                }
                note={
                  latest
                    ? authored
                      ? "Reviewed recipe · no model"
                      : "Stored model provenance"
                    : "Prepare an explicit objective"
                }
                state={latest ? "done" : "waiting"}
              />
              <PipelineStep
                index="03"
                label="ACT"
                title={latest ? "Browser actions" : "Awaiting approval"}
                note={
                  latest
                    ? `${latest.results.filter((result) => result.status === "SUCCEEDED").length} / ${latest.manifest.actions.length} actions succeeded`
                    : "Nothing runs without approval"
                }
                state={
                  latest?.session.status === "COMPLETED"
                    ? "done"
                    : latest &&
                        ["RUNNING", "RECOVERING"].includes(
                          latest.session.status,
                        )
                      ? "active"
                      : "waiting"
                }
              />
              <PipelineStep
                index="04"
                label="VERIFY"
                title="Independent outcome"
                note={
                  report.data?.effective_verdict?.replaceAll("_", " ") ??
                  (report.error
                    ? "Evidence unavailable"
                    : "Awaiting independent proof")
                }
                state={
                  report.data?.effective_verdict === "VERIFIED_SUCCESS"
                    ? "done"
                    : report.data?.effective_verdict
                      ? "attention"
                      : "waiting"
                }
              />
            </div>
          </section>
          <section className="overview-panel overview-browser">
            <PanelHeading
              icon={<Monitor size={18} />}
              title={
                latest &&
                ["RUNNING", "RECOVERING"].includes(latest.session.status)
                  ? "Live execution observations"
                  : "Latest execution capture"
              }
            >
              <span className="overview-label">
                {latest?.session.status ?? "NO RUN SELECTED"}
              </span>
            </PanelHeading>
            {latest ? (
              <ExecutionPreview execution={latest} token={token} />
            ) : (
              <div className="overview-browser-empty">
                <ScanLine size={44} strokeWidth={1} aria-hidden="true" />
                <h3>Your browser observations appear here</h3>
                <p>
                  {token
                    ? "Create a task, review its plan and authorize execution to capture a real frame."
                    : "Connect your operator capability to inspect a saved execution."}
                </p>
                <Link
                  className="overview-text-link"
                  to="/missions/new?compose=1"
                >
                  Create a task <ArrowRight size={14} />
                </Link>
              </div>
            )}
            {latest && (
              <div className="overview-run-caption">
                <Link to={executionLink}>
                  #{latest.session.task_id.slice(0, 8)}
                </Link>
                <span>{latest.manifest.plan_snapshot.plan.goal}</span>
                <Link to={executionLink} className="overview-inspect">
                  Inspect run <ArrowUpRight size={13} />
                </Link>
              </div>
            )}
          </section>
          <section className="overview-panel overview-executions">
            <PanelHeading
              icon={<History size={18} />}
              title="Recent Autonomous Executions"
            >
              <Link className="overview-text-link" to="/tasks">
                View all tasks <ArrowRight size={14} />
              </Link>
            </PanelHeading>
            {executions.length ? (
              <div className="overview-table-scroll">
                <table>
                  <caption className="sr-only">
                    Recent recorded executions; completion and independent
                    verification are separate
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Task ID</th>
                      <th scope="col">Objective</th>
                      <th scope="col">Target app</th>
                      <th scope="col">Status</th>
                      <th scope="col">Duration</th>
                      <th scope="col">Verification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.slice(0, 5).map((execution) => {
                      const savedVerification =
                        overview.data?.recent_verifications.find(
                          (verification) =>
                            verification.session.execution_id ===
                            execution.session.id,
                        );
                      const freshVerdict =
                        execution.session.id === latest?.session.id
                          ? report.data?.effective_verdict
                          : null;
                      return (
                        <tr key={execution.session.id}>
                          <td>
                            <Link
                              to={`/execution?execution=${execution.session.id}`}
                              className="overview-task-id"
                            >
                              #{execution.session.task_id.slice(0, 8)}
                            </Link>
                          </td>
                          <td>
                            <Link
                              to={`/execution?execution=${execution.session.id}`}
                              className="overview-objective"
                            >
                              {execution.manifest.plan_snapshot.plan.goal}
                            </Link>
                            <small>
                              {execution.manifest.plan_snapshot.model_usage
                                .length
                                ? "Meta plan"
                                : "Authored · no model"}
                            </small>
                          </td>
                          <td>
                            <span className="overview-app-tag">
                              Inventory sandbox
                            </span>
                          </td>
                          <td>
                            <span
                              className={`overview-run-state ${execution.session.status === "COMPLETED" ? "tone-green" : ["FAILED", "TIMED_OUT"].includes(execution.session.status) ? "tone-red" : "tone-cyan"}`}
                            >
                              {execution.session.status}
                            </span>
                          </td>
                          <td className="overview-duration">
                            {durationLabel(executionSeconds(execution))}
                          </td>
                          <td>
                            {savedVerification ? (
                              <Link
                                className="overview-proof-link"
                                to={`/verification?verification=${savedVerification.session.id}&execution=${execution.session.id}`}
                              >
                                <ShieldCheck size={13} aria-hidden="true" />
                                {freshVerdict
                                  ? verdictLabel(freshVerdict)
                                  : "Open report"}
                              </Link>
                            ) : (
                              <span className="overview-muted">
                                Not verified
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="overview-empty-row">
                {overview.isPending && token
                  ? "Loading saved executions…"
                  : "No executions loaded. Completed steps and verified outcomes will be shown separately."}
              </p>
            )}
            <p className="overview-table-note">
              Latest {executions.length} saved runs loaded. “Completed”
              describes action execution; open the independent report to inspect
              the persisted outcome.
            </p>
          </section>
        </div>
        <aside className="overview-secondary">
          <section className="overview-panel overview-topology">
            <PanelHeading
              icon={<Layers3 size={18} />}
              title="Meta AI & Runtime Topology"
            >
              <span className="overview-label">LOCAL</span>
            </PanelHeading>
            <div className="overview-runtime-list">
              <RuntimeRow
                icon={<Activity size={16} />}
                label="INTI backend"
                note="FastAPI orchestration"
                value={
                  system.data?.backend
                    ? "Online"
                    : system.error
                      ? "Unavailable"
                      : "Checking"
                }
                state={system.data?.backend ? "green" : "gold"}
              />
              <RuntimeRow
                icon={<Bot size={16} />}
                label={model.data?.model ?? "Meta model"}
                note="Visual reasoning & planning"
                value={
                  model.data?.available === true
                    ? "Available"
                    : model.data?.configured
                      ? "Unverified"
                      : "Not configured"
                }
                state={model.data?.available === true ? "green" : "gold"}
              />
              <RuntimeRow
                icon={<Monitor size={16} />}
                label="Isolated Chromium"
                note="Authorized browser worker"
                value={
                  system.data?.browser
                    ? "Ready"
                    : system.error
                      ? "Unavailable"
                      : "Checking"
                }
                state={system.data?.browser ? "green" : "gold"}
              />
              <RuntimeRow
                icon={<Database size={16} />}
                label="PostgreSQL"
                note="Observation & execution records"
                value={
                  system.data?.database
                    ? "Connected"
                    : system.error
                      ? "Unavailable"
                      : "Checking"
                }
                state={system.data?.database ? "green" : "gold"}
              />
              <RuntimeRow
                icon={<ShieldCheck size={16} />}
                label="Independent verifier"
                note="Read-only persisted-state evidence"
                value={
                  overview.data
                    ? overview.data.features.verification_enabled
                      ? "Enabled"
                      : "Disabled"
                    : "Connect to inspect"
                }
                state={
                  overview.data?.features.verification_enabled
                    ? "green"
                    : "gold"
                }
              />
            </div>
          </section>
          <section className="overview-panel overview-recovery">
            <PanelHeading
              icon={<Wrench size={18} />}
              title="Recovery Pulse Feed"
            >
              <span className="overview-label overview-label-gold">
                BOUNDED
              </span>
            </PanelHeading>
            {recoveries.data?.items.length ? (
              <ol className="overview-recovery-feed">
                {recoveries.data.items.slice(0, 3).map((recovery) => (
                  <li key={recovery.session.id}>
                    <time dateTime={recovery.session.started_at}>
                      {new Date(recovery.session.started_at).toLocaleString()}
                    </time>
                    <Link to={`/recovery?recovery=${recovery.session.id}`}>
                      {recovery.session.initial_failure_type.replaceAll(
                        "_",
                        " ",
                      )}
                    </Link>
                    <p>
                      {recovery.session.status} ·{" "}
                      {recovery.session.attempts_count} attempts
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="overview-recovery-empty">
                <Wrench size={24} strokeWidth={1.2} aria-hidden="true" />
                <p>
                  {recoveries.error
                    ? "Recovery records are unavailable."
                    : token
                      ? "No recovery records loaded."
                      : "Connect to inspect recovery history."}
                </p>
                <small>
                  {overview.data?.features.recovery_live_model_enabled
                    ? "Recoveries appear here after an actual detected fault."
                    : "Live model recovery is unavailable in this environment."}
                </small>
              </div>
            )}
            <Link className="overview-text-link" to="/recovery">
              Open Recovery Center <ArrowRight size={13} />
            </Link>
          </section>
          <section className="overview-panel overview-shortcuts">
            <PanelHeading title="Command Shortcuts">
              <span className="overview-label">WORKSPACES</span>
            </PanelHeading>
            <div className="overview-shortcut-grid">
              <Shortcut
                to="/observations"
                label="Visual Observations"
                note="Inspect captured frames"
                icon={<Compass size={18} />}
              />
              <Shortcut
                to="/planning"
                label="Plan Inspector"
                note="Review actions and risks"
                icon={<Gauge size={18} />}
              />
              <Shortcut
                to="/models"
                label="AI Models"
                note="Configuration & availability"
                icon={<Cpu size={18} />}
              />
              <Shortcut
                to="/verification"
                label="Verification Lab"
                note="Independent outcome reports"
                icon={<ShieldCheck size={18} />}
              />
            </div>
          </section>
        </aside>
      </div>
      <dialog
        ref={connectionDialog}
        className="overview-connection-dialog"
        aria-labelledby="overview-connect-title"
      >
        <div className="overview-connection-heading">
          <h2 id="overview-connect-title">Connect your local operator</h2>
          <form method="dialog">
            <button aria-label="Close operator connection">
              <X size={18} />
            </button>
          </form>
        </div>
        <p>
          Your capability stays in memory. Viewing this overview never
          authorizes an execution.
        </p>
        <OperatorConnection />
      </dialog>
    </div>
  );
}

export function Metric({
  label,
  value,
  tag,
  note,
  tone = "default",
  icon,
  children,
}: {
  label: string;
  value: ReactNode;
  tag: string;
  note: string;
  tone?: string;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className={`overview-metric-card metric-${tone}`}
      aria-label={label}
    >
      <div className="overview-metric-title">
        <span>
          {icon}
          {label}
        </span>
        <span className="overview-label">{tag}</span>
      </div>
      <strong>{value}</strong>
      <div className="overview-metric-bottom">
        <p>{note}</p>
        {children}
      </div>
    </section>
  );
}
export function PanelHeading({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="overview-panel-heading">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </header>
  );
}
export function PipelineStep({
  index,
  label,
  title,
  note,
  state,
}: {
  index: string;
  label: string;
  title: string;
  note: string;
  state: string;
}) {
  return (
    <div className={`overview-loop-step loop-${state}`}>
      <div>
        <span>
          {index} {label}
        </span>
        {state === "done" ? (
          <CheckCircle2 size={15} aria-hidden="true" />
        ) : (
          <Circle size={15} aria-hidden="true" />
        )}
      </div>
      <h3>{title}</h3>
      <p>{note}</p>
      <span className="overview-loop-track" aria-hidden="true">
        <i />
      </span>
    </div>
  );
}
export function RuntimeRow({
  icon,
  label,
  note,
  value,
  state,
}: {
  icon: ReactNode;
  label: string;
  note: string;
  value: string;
  state: string;
}) {
  return (
    <div className="overview-runtime-row">
      <span className={`overview-runtime-icon tone-${state}`}>{icon}</span>
      <div>
        <strong>{label}</strong>
        <small>{note}</small>
      </div>
      <span className={`overview-runtime-value tone-${state}`}>{value}</span>
    </div>
  );
}
export function Shortcut({
  to,
  label,
  note,
  icon,
}: {
  to: string;
  label: string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <Link to={to}>
      {icon}
      <strong>{label}</strong>
      <small>{note}</small>
    </Link>
  );
}
function verdictLabel(verdict: Verdict) {
  return verdict === "VERIFIED_SUCCESS"
    ? "Verified"
    : verdict === "VERIFIED_FAILURE"
      ? "Failed"
      : "Inconclusive";
}
function DurationTrend({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const low = Math.min(...values),
    range = Math.max(...values) - low;
  const points = values
    .map(
      (value, index) =>
        `${(index * 100) / (values.length - 1)},${range ? 27 - ((value - low) * 24) / range : 15}`,
    )
    .join(" ");
  return (
    <svg
      className="overview-duration-trend"
      viewBox="0 0 100 30"
      role="img"
      aria-label="Recorded completed-run durations, oldest to newest"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
function ExecutionPreview({
  execution,
  token,
}: {
  execution: ExecutionBundle;
  token: string;
}) {
  const id = execution.session.latest_observation_id;
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  const screenshot = useQuery({
    queryKey: ["overview-frame", token, id],
    queryFn: () => executionApi.screenshot(id!, token),
    enabled: !!id && !!token,
    gcTime: 0,
  });
  const observation = useQuery({
    queryKey: ["overview-frame-time", token, id],
    queryFn: () => executionApi.observation(id!, token),
    enabled: !!id && !!token,
  });
  useEffect(() => {
    if (!screenshot.data || !id) return;
    const url = URL.createObjectURL(screenshot.data);
    setImage({ id, url });
    return () => URL.revokeObjectURL(url);
  }, [screenshot.data, id]);
  return (
    <>
      <div className="overview-browser-address">
        <span aria-hidden="true">● ● ●</span>
        <span>
          {execution.browser_session?.current_url ??
            execution.manifest.initial_url}
        </span>
        <span className="overview-label">CAPTURED VIEWPORT</span>
      </div>
      {screenshot.error ? (
        <p className="overview-error" role="alert">
          {errorMessage(screenshot.error)}
        </p>
      ) : image?.id === id ? (
        <div className="overview-browser-frame">
          <img src={image.url} alt="Latest recorded execution frame" />
          <div className="overview-frame-label">
            <ScanLine size={13} aria-hidden="true" />
            {execution.manifest.viewport.width} ×{" "}
            {execution.manifest.viewport.height}
            <span>Stored observation · not a video stream</span>
          </div>
        </div>
      ) : (
        <div className="overview-browser-empty">
          <ScanLine size={32} aria-hidden="true" />
          <p>
            {id
              ? "Loading protected browser observation…"
              : "No frame was recorded for this execution."}
          </p>
        </div>
      )}
      <div className="overview-frame-time">
        <span className="health-dot idle" aria-hidden="true" />
        {observation.data ? (
          <time dateTime={observation.data.timestamp}>
            {new Date(observation.data.timestamp).toLocaleString()}
          </time>
        ) : (
          "Capture time unavailable"
        )}
        <span>Independent verification is shown separately</span>
      </div>
    </>
  );
}
