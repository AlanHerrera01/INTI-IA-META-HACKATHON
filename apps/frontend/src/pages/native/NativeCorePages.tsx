import { useState } from "react";
import { modelAccessState } from "../../features/computer/modelStatus";
import { DocumentWorkflowForm } from "../../components/DocumentWorkflowForm";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Eye,
  GitBranch,
  Layers3,
  ListChecks,
  Monitor,
  PlayCircle,
  Plus,
  Radar,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  Metric,
  PanelHeading,
  PipelineStep,
  RuntimeRow,
  Shortcut,
} from "../Overview";
import { ComputerPage } from "../ComputerPage";
import { ComputerApplications } from "../../components/ComputerApplications";
import { useNativeWorkspace } from "../../hooks/useNativeWorkspace";
import { useLocale } from "../../i18n/useLocale";
import { taskName } from "../../features/computer/workflow";
import {
  NativeAccess,
  NativeEvidence,
  NativeExport,
  NativeFacts,
  NativeFrame,
  NativeLedger,
  NativePanel,
  NativeTaskPicker,
} from "../../features/computer/NativePresentation";

export function NativeMission() {
  const { t } = useLocale();
  const { data, tasks, selected, setSelectedId, query, metrics } =
    useNativeWorkspace();
  return (
    <div className="mission-workspace native-design-page" data-design="mission">
      <header className="mission-hero">
        <div>
          <p className="eyebrow">
            {t("INTELLIGENT NAVIGATION, TASK EXECUTION & INTERACTION")}
          </p>
          <h1>
            {t("Mission Control")}
            <span className="gold-dot">.</span>
          </h1>
          <p>{t("From an objective to an outcome you can inspect.")}</p>
          <div className="mission-lifecycle">
            {["PERCEIVE", "REASON", "PLAN", "ACT", "RECOVER", "VERIFY"].map(
              (label, index) => (
                <span key={label}>
                  {index > 0 && <b>→</b>}
                  {t(label)}
                </span>
              ),
            )}
          </div>
        </div>
        <div className="mission-hero-actions">
          <span className="workspace-tag">{t("LOCAL WORKSPACE")}</span>
          <Link
            className="button secondary"
            to={selected ? `/execution?task=${selected.id}` : "/execution"}
          >
            <PlayCircle size={15} />
            {t("Inspect execution")}
          </Link>
          <Radar size={48} strokeWidth={0.8} />
        </div>
      </header>
      <div className="overview-metrics">
        {[
          ["Loaded tasks", data ? metrics.total : "—"],
          ["Queued / running tasks", data ? metrics.active : "—"],
          ["File readbacks", data ? metrics.fileReadbacks : "—"],
          ["Application launch requests", data ? metrics.launches : "—"],
        ].map(([label, value]) => (
          <div className="overview-metric" key={label}>
            <span>{t(String(label))}</span>
            <strong>{value}</strong>
            <small>{t("Latest 100 task records.")}</small>
          </div>
        ))}
      </div>
      <NativeAccess />
      <div className="mission-columns">
        <div className="mission-primary">
          <section className="mission-card">
            <div className="mission-section-title">
              <h2>{t("Quick task")}</h2>
              <span className="mission-source">{t("Paired local agent")}</span>
            </div>
            <ComputerPage
              presentation="compose"
              onTaskPrepared={async (task) => {
                setSelectedId(task.id);
                await query.refetch();
              }}
            />
          </section>
          {selected && (
            <section className="mission-card active-mission">
              <div className="mission-section-title">
                <h2>{taskName(selected)}</h2>
                <span className="workspace-tag">{t(selected.status)}</span>
              </div>
              <ComputerPage presentation="review" initialTaskId={selected.id} />
            </section>
          )}
          <section className="mission-card">
            <div className="mission-section-title">
              <h2>{t("Recent computer tasks")}</h2>
            </div>
            <NativeLedger />
          </section>
        </div>
        <aside className="mission-secondary">
          <section className="mission-card">
            <h2>{t("Runtime Environment")}</h2>
            <NativeFacts />
            <Link to="/computer">{t("Applications on this computer")} →</Link>
          </section>
          <section className="mission-card mission-guide">
            <h2>{t("Guided workflow")}</h2>
            <ol className="native-stream">
              {[
                "Inspect connected context",
                "Prepare plan",
                "Review & execute",
                "Recorded verification evidence",
              ].map((label, index) => (
                <li key={label}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{t(label)}</strong>
                </li>
              ))}
            </ol>
          </section>
          <section className="mission-card">
            <h2>{t("Recent Autonomous Executions")}</h2>
            <p className="native-note">
              {tasks.length} {t("Loaded tasks")}
            </p>
            <Link to="/tasks">{t("Task Manager")}</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function NativeOverview() {
  const { t } = useLocale();
  const { data, selected, metrics, device, system, model } =
    useNativeWorkspace();
  const checks =
    selected?.result?.steps.filter(
      (step) => step.status === "VERIFIED_READBACK",
    ).length || 0;
  return (
    <div
      className="overview-workspace native-design-page"
      data-design="overview"
    >
      <section className="overview-welcome">
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
              <h1>{t("Welcome to INTI AI")}</h1>
              <span className="overview-label">
                LOCAL v{system.data?.version || "0.7.0"}
              </span>
            </div>
            <p>
              {t(
                "Your visual intelligence command center. Reviewed actions on your connected computer.",
              )}
            </p>
          </div>
        </div>
        <div className="overview-welcome-actions">
          <Link className="button secondary" to="/execution">
            <PlayCircle size={16} />
            {t("View Live Execution")}
          </Link>
          <Link className="button solar-button" to="/planning">
            <Plus size={16} />
            {t("Create New Task")}
          </Link>
        </div>
      </section>
      <NativeAccess />
      <div className="overview-stat-grid">
        <Metric
          label={t("Loaded tasks")}
          value={data ? metrics.total : "—"}
          tag={t("RECORDED")}
          note={t("Latest 100 task records.")}
          icon={<ListChecks size={15} />}
        />
        <Metric
          label={t("Successful executions")}
          value={data ? metrics.completed : "—"}
          tag={t("LOCAL")}
          note={t("Execution completion and verification remain separate.")}
          tone="green"
          icon={<CheckCircle2 size={15} />}
        />
        <Metric
          label={t("Recovery success rate")}
          value="—"
          tag={t("UNMEASURED")}
          note={t("No recovery-rate benchmark available")}
          tone="gold"
          icon={<Wrench size={15} />}
        />
        <Metric
          label={t("Avg execution time")}
          value="—"
          tag={t("UNMEASURED")}
          note={t("Action duration is not reported by this agent.")}
          icon={<Clock3 size={15} />}
        />
      </div>
      <div className="overview-columns">
        <div className="overview-primary">
          <section className="overview-panel overview-pipeline">
            <PanelHeading
              title={t("Active Autonomous Pipeline Architecture")}
              icon={<GitBranch size={18} />}
            />
            <div className="overview-loop">
              <PipelineStep
                index="01"
                label="PERCEIVE"
                title={t("Connected computer")}
                note={device?.name || t("Not connected")}
                state={device ? "done" : "waiting"}
              />
              <PipelineStep
                index="02"
                label="REASON"
                title={t("Reviewed typed plan")}
                note={t("Authored sample · 0 model calls")}
                state={selected ? "done" : "waiting"}
              />
              <PipelineStep
                index="03"
                label="ACT"
                title={t("Local actions")}
                note={`${selected?.result?.steps.length || 0} / ${selected?.steps.length || 0}`}
                state={selected?.status === "COMPLETED" ? "done" : "waiting"}
              />
              <PipelineStep
                index="04"
                label="VERIFY"
                title={t("Recorded verification evidence")}
                note={
                  checks
                    ? t("VERIFIED_READBACK")
                    : t("No independent visual verdict")
                }
                state={checks ? "done" : "waiting"}
              />
            </div>
          </section>
          <section className="overview-panel overview-browser">
            <PanelHeading
              title={t("Latest execution capture")}
              icon={<Monitor size={18} />}
            >
              {selected && (
                <span className="overview-label">{t(selected.status)}</span>
              )}
            </PanelHeading>
            <NativeFrame />
            <div className="native-preview-caption">
              <code>#{selected?.id.slice(0, 8) || "—"}</code>
              <span>
                {selected
                  ? taskName(selected)
                  : t("No action evidence available yet.")}
              </span>
              <Link
                to={selected ? `/execution?task=${selected.id}` : "/execution"}
              >
                {t("Inspect run")} <ArrowRight size={13} />
              </Link>
            </div>
          </section>
          <section className="overview-panel overview-history">
            <PanelHeading
              title={t("Recent Autonomous Executions")}
              icon={<Activity size={18} />}
            />
            <NativeLedger />
          </section>
        </div>
        <aside className="overview-secondary">
          <section className="overview-panel overview-runtime">
            <PanelHeading
              title={t("Meta AI & Runtime Topology")}
              icon={<Layers3 size={18} />}
            />
            <RuntimeRow
              label="INTI backend"
              note={t("Local orchestration")}
              value={t(system.data?.backend ? "ONLINE" : "UNAVAILABLE")}
              state={system.data?.backend ? "green" : "gold"}
              icon={<Activity size={17} />}
            />
            <RuntimeRow
              label={model.data?.model || "Meta"}
              note={t("Model access")}
              value={t(modelAccessState(model.data))}
              state={model.data?.available === true ? "green" : "gold"}
              icon={<Bot size={17} />}
            />
            <RuntimeRow
              label={t("Paired local agent")}
              note={device?.name || t("Not connected")}
              value={t(
                device && Date.now() / 1000 - device.last_seen < 30
                  ? "ONLINE"
                  : "OFFLINE",
              )}
              state="green"
              icon={<Monitor size={17} />}
            />
            <RuntimeRow
              label="PostgreSQL"
              note={t("Persistent task records")}
              value={t(system.data?.database ? "Connected" : "Not connected")}
              state="green"
              icon={<Database size={17} />}
            />
            <RuntimeRow
              label={t("File readbacks")}
              note={t("Agent-reported evidence")}
              value={String(metrics.fileReadbacks)}
              state="green"
              icon={<ShieldCheck size={17} />}
            />
          </section>
          <section className="overview-panel overview-recovery">
            <PanelHeading
              title={t("Recovery Pulse Feed")}
              icon={<Wrench size={18} />}
            />
            <div className="overview-recovery-empty">
              <Wrench size={24} />
              <p>
                {metrics.attention} {t("Tasks requiring attention")}
              </p>
              <small>{t("No automatic replay")}</small>
            </div>
            <Link className="overview-text-link" to="/recovery">
              {t("Open Recovery Center")} <ArrowRight size={13} />
            </Link>
          </section>
          <section className="overview-panel overview-shortcuts">
            <PanelHeading title={t("Command Shortcuts")} />
            <div className="overview-shortcut-grid">
              <Shortcut
                to="/observations"
                label={t("Visual Observations")}
                note={t("Recorded local context")}
                icon={<Eye size={18} />}
              />
              <Shortcut
                to="/planning"
                label={t("Plan Inspector")}
                note={t("Review actions and risks")}
                icon={<GitBranch size={18} />}
              />
              <Shortcut
                to="/models"
                label={t("AI Models")}
                note={t("Configuration & availability")}
                icon={<Cpu size={18} />}
              />
              <Shortcut
                to="/verification"
                label={t("Verification Lab")}
                note={t("Recorded verification evidence")}
                icon={<ShieldCheck size={18} />}
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function NativeStudio() {
  const { t } = useLocale();
  const {
    token,
    devices,
    device,
    selected,
    setSelectedId,
    setDeviceId,
    query,
    model,
  } = useNativeWorkspace();
  const [mode, setMode] = useState("text");
  return (
    <div className="studio-workspace native-design-page" data-design="studio">
      <header className="studio-heading">
        <div>
          <div className="studio-title-row">
            <h1>{t("AI Agent Studio")}</h1>
            <span className="studio-tag studio-cyan-tag">
              {t("PLAN & ORCHESTRATE")}
            </span>
            <span className="studio-tag studio-gold-tag">
              {t("APPROVAL REQUIRED")}
            </span>
          </div>
          <p>
            {t(
              "Prepare a plan, inspect its actions and review every boundary.",
            )}
          </p>
        </div>
        <Link className="button secondary" to="/tasks">
          {t("Recent computer tasks")}
        </Link>
      </header>
      <NativeAccess />
      <div className="studio-layout">
        <div className="studio-main">
          <section className="studio-card studio-composer">
            <header className="studio-card-heading">
              <h2>{t("INTI directive prompt")}</h2>
              <div className="native-mode-tabs">
                <button
                  aria-pressed={mode === "text"}
                  onClick={() => setMode("text")}
                >
                  {t("Text task")}
                </button>
                <button
                  aria-pressed={mode === "applications"}
                  onClick={() => setMode("applications")}
                >
                  {t("Applications on this computer")}
                </button>
                <button
                  aria-pressed={mode === "documents"}
                  onClick={() => setMode("documents")}
                >
                  {t("Documents")}
                </button>
              </div>
            </header>
            {mode === "text" ? (
              <ComputerPage
                presentation="compose"
                onTaskPrepared={async (task) => {
                  setSelectedId(task.id);
                  await query.refetch();
                }}
              />
            ) : mode === "documents" ? (
              <DocumentWorkflowForm
                token={token}
                devices={devices}
                deviceId={device?.id || ""}
                onDevice={setDeviceId}
                onPrepared={async (task) => {
                  setSelectedId(task.id);
                  await query.refetch();
                }}
              />
            ) : (
              <ComputerApplications
                token={token}
                devices={devices}
                targetId={device?.id || ""}
                onTarget={setDeviceId}
                onPrepared={async (task) => {
                  setSelectedId(task.id);
                  await query.refetch();
                }}
              />
            )}
          </section>
          <section className="studio-card">
            <header className="studio-card-heading">
              <h2>{t("Compiled Execution Tree")}</h2>
              <span className="studio-tag">
                {selected?.steps.length || 0} {t("typed actions")}
              </span>
            </header>
            <NativeTaskPicker />
            {selected ? (
              <ComputerPage presentation="review" initialTaskId={selected.id} />
            ) : (
              <p className="native-note">{t("Prepare plan")}</p>
            )}
          </section>
          <details className="studio-card">
            <summary>{t("Plan metadata & trace")}</summary>
            <pre className="native-json">
              {selected ? JSON.stringify(selected.plan, null, 2) : "—"}
            </pre>
          </details>
        </div>
        <aside className="studio-aside">
          <section className="studio-card">
            <h2>{t("Active Intelligence Engine")}</h2>
            <div className="native-dark-card">
              <h3>{t("Reviewed typed plan")}</h3>
              <p className="native-note">
                {t(
                  "Local plans remain authored. Automatic task model calls are disabled; calibration is a separate, explicitly confirmed request. Desktop visual planning is not connected yet.",
                )}
              </p>
              <dl className="native-design-facts">
                <dt>{t("Model access")}</dt>
                <dd>{t(modelAccessState(model.data))}</dd>
                <dt>{t("Recorded model calls")}</dt>
                <dd>{model.data?.measurements?.attempts ?? 0}</dd>
              </dl>
            </div>
            <Link to="/models">
              {t("AI Models")} <ArrowRight size={13} />
            </Link>
          </section>
          <section className="studio-card">
            <h2>{t("Scope Matrix")}</h2>
            <NativeFacts />
            <div className="native-capability-grid">
              {[
                "Create a new text file",
                "Request Notepad to open that file",
                "Request the default browser to open the approved URL",
                "Request the approved application to open",
              ].map((label) => (
                <span key={label}>
                  <CheckCircle2 size={13} />
                  {t(label)}
                </span>
              ))}
            </div>
          </section>
          <section className="studio-card">
            <h2>{t("Execution Safeguards")}</h2>
            <p className="native-note">
              {t(
                "Approval is tied to the exact manifest digest. Preparation never starts an action.",
              )}
            </p>
            <p className="native-note">
              {t(
                "Cancellation stops remaining actions; it does not close existing windows or undo file creation.",
              )}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function NativeExecution() {
  const { t } = useLocale();
  const { selected } = useNativeWorkspace();
  return (
    <div
      className="execution-workspace live-workspace native-design-page"
      data-design="execution"
    >
      <header className="live-command-heading">
        <div>
          <div className="live-heading-tags">
            <span>{t("LOCAL AGENTIC LOOP")}</span>
            <small>SEE · REASON · ACT · VERIFY</small>
          </div>
          <h1>{t("Live Execution")}</h1>
          <p>
            {t(
              "Inspect a local execution, its recorded steps and outcome evidence.",
            )}
          </p>
        </div>
        <div className="live-heading-runtime">
          <div className="live-header-facts">
            <div>
              <small>{t("Status")}</small>
              <strong>{selected ? t(selected.status) : "—"}</strong>
            </div>
            <div>
              <small>{t("Recorded steps")}</small>
              <strong>{selected?.result?.steps.length || 0}</strong>
            </div>
            <div>
              <small>{t("Execution mode")}</small>
              <strong>{t("Paired local agent")}</strong>
            </div>
          </div>
        </div>
      </header>
      <NativeAccess />
      <div className="live-session-toolbar">
        <NativeTaskPicker />
      </div>
      <div className="live-command-layout">
        <div className="live-left-column">
          <section className="live-panel">
            <header className="live-panel-heading">
              <h2>{t("Perception Stream")}</h2>
            </header>
            <ol className="native-stream">
              {selected?.steps.map((step, index) => {
                const receipt = selected.result?.steps.find(
                  (item) => item.id === step.id,
                );
                return (
                  <li key={step.id}>
                    <span>
                      {String(index + 1).padStart(2, "0")} ·{" "}
                      {t(receipt?.status || "PENDING")}
                    </span>
                    <strong>{t(step.action)}</strong>
                    <code>{step.target}</code>
                  </li>
                );
              })}
            </ol>
          </section>
          <section className="live-panel">
            <h2>{t("Event Feed")}</h2>
            <p className="native-note">
              {t(
                "Creation and latest update times come from the task ledger. Individual action timestamps are not available.",
              )}
            </p>
            <NativeFacts />
          </section>
        </div>
        <div className="live-center-column">
          <NativeFrame />
          <section className="live-progress-card">
            <div className="live-progress-heading">
              <strong>
                {selected?.result?.steps.length || 0} /{" "}
                {selected?.steps.length || 0} {t("recorded action receipts")}
              </strong>
              <span>{selected ? t(selected.status) : "—"}</span>
            </div>
            {selected ? (
              <ComputerPage presentation="review" initialTaskId={selected.id} />
            ) : (
              <p className="native-note">
                {t("No action evidence available yet.")}
              </p>
            )}
          </section>
        </div>
        <aside className="live-right-column">
          <section className="live-panel">
            <h2>{t("AGENT EXECUTION STATE")}</h2>
            <strong className="native-state-large">
              {selected ? t(selected.status) : "—"}
            </strong>
            <p className="native-note">
              {t("Live receipts are not a video stream.")}
            </p>
          </section>
          <section className="live-panel">
            <h2>{t("Task Objective")}</h2>
            <h3>{selected ? taskName(selected) : "—"}</h3>
            <Link to={`/planning${selected ? "?task=" + selected.id : ""}`}>
              {t("Plan Inspector")} <ArrowRight size={13} />
            </Link>
          </section>
          <section className="live-panel">
            <h2>{t("Recorded Action Trace")}</h2>
            <NativeEvidence />
          </section>
          <section className="live-panel">
            <h2>{t("Execution Boundaries")}</h2>
            <p className="native-note">
              {t(
                "Approval is tied to the exact manifest digest. Preparation never starts an action.",
              )}
            </p>
            <Link to="/recovery">{t("Recovery Center")}</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function NativeTasks() {
  const { t, dateLocale } = useLocale();
  const { tasks, selected, setSelectedId, metrics, data } =
    useNativeWorkspace();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const visible = tasks.filter(
    (task) =>
      (!status || task.status === status) &&
      `${taskName(task)} ${task.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div
      className="task-workspace task-manager-desktop native-design-page"
      data-design="tasks"
    >
      <header className="task-manager-heading">
        <div>
          <p className="task-manager-eyebrow">
            {t("AUTONOMOUS DISPATCH")}{" "}
            <span>{t("RECORDED LOCAL WORKFLOWS")}</span>
          </p>
          <h1>{t("Task Manager")}</h1>
          <p>
            {t(
              "Track each objective, inspect its execution and follow the evidence behind its outcome.",
            )}
          </p>
        </div>
        <div className="task-manager-metrics">
          {[
            ["Loaded tasks", metrics.total],
            ["File readbacks", metrics.fileReadbacks],
            ["Tasks requiring attention", metrics.attention],
          ].map(([label, value]) => (
            <section key={label}>
              <ListChecks size={16} />
              <div>
                <span>{t(String(label))}</span>
                <strong>{data ? value : "—"}</strong>
              </div>
            </section>
          ))}
        </div>
      </header>
      <NativeAccess />
      <div className="task-manager-toolbar">
        <div className="task-manager-tabs">
          {[
            ["", "All Tasks"],
            ["RUNNING", "RUNNING"],
            ["COMPLETED", "COMPLETED"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <label className="task-manager-search">
          <Search size={15} />
          <input
            aria-label={t("Search tasks")}
            placeholder={t("Search tasks")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Link className="button primary" to="/planning">
          <Plus size={15} />
          {t("New Task")}
        </Link>
      </div>
      <div className="task-manager-layout">
        <section className="task-manager-ledger">
          <header className="task-ledger-heading">
            <h2>
              <ListChecks size={16} /> {t("Active Task Ledger")}
            </h2>
            <NativeExport />
          </header>
          <p className="task-ledger-scope">{t("Latest 100 task records.")}</p>
          <div className="task-table-scroll">
            <table className="task-table">
              <thead>
                <tr>
                  <th>{t("Task")}</th>
                  <th>{t("Objective / name")}</th>
                  <th>{t("Target application")}</th>
                  <th>{t("Planning source")}</th>
                  <th>{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => (
                  <tr
                    key={task.id}
                    className={
                      selected?.id === task.id ? "task-row-selected" : ""
                    }
                  >
                    <td>
                      <button
                        className="task-select-id"
                        onClick={() => setSelectedId(task.id)}
                      >
                        #{task.id.slice(0, 8)}
                      </button>
                    </td>
                    <td>
                      <button
                        className="task-objective"
                        onClick={() => setSelectedId(task.id)}
                      >
                        {taskName(task)}
                      </button>
                      <small className="task-created-at">
                        {new Date(task.created_at * 1000).toLocaleString(
                          dateLocale,
                        )}
                      </small>
                    </td>
                    <td>
                      {task.plan.kind === "open_application"
                        ? task.plan.application.name
                        : t("Computer")}
                    </td>
                    <td>{t("Reviewed typed plan")}</td>
                    <td>{t(task.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="task-empty">
                {t("No action evidence available yet.")}
              </p>
            )}
          </div>
          <div className="task-pagination">
            {visible.length} / {tasks.length} {t("Loaded tasks")}
          </div>
        </section>
        <aside className="task-manager-sidebar">
          <section className="native-task-inspector">
            <header>
              <h2>{t("Task Inspector")}</h2>
              <code>#{selected?.id.slice(0, 8) || "—"}</code>
            </header>
            <div className="native-dark-card">
              <h3>{selected ? taskName(selected) : "—"}</h3>
              <NativeFacts />
            </div>
            <NativeFrame compact />
            <section className="native-inspector-steps">
              <h3>{t("Recorded steps")}</h3>
              <ol>
                {selected?.steps.map((step, index) => (
                  <li key={step.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{t(step.action)}</strong>
                    <small>
                      {t(
                        selected.result?.steps.find(
                          (item) => item.id === step.id,
                        )?.status || "PENDING",
                      )}
                    </small>
                  </li>
                ))}
              </ol>
            </section>
            <details>
              <summary>{t("Plan metadata & trace")}</summary>
              <pre className="native-json">
                {JSON.stringify(selected?.plan || {}, null, 2)}
              </pre>
            </details>
            <Link
              to={
                selected ? `/verification?task=${selected.id}` : "/verification"
              }
            >
              {t("Open Verification Lab")} <ArrowRight size={14} />
            </Link>
            <div className="native-inspector-actions">
              <NativeExport />
              <Link
                to={selected ? `/execution?task=${selected.id}` : "/execution"}
              >
                {t("View Live Execution")}
              </Link>
            </div>
          </section>
          <NativePanel title="Recovery History">
            <Link to="/recovery">
              {t("Tasks requiring attention")}: {metrics.attention}
            </Link>
          </NativePanel>
        </aside>
      </div>
    </div>
  );
}
