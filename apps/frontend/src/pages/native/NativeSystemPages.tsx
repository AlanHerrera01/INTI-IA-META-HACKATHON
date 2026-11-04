import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  Download,
  Eye,
  Layers3,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useNativeWorkspace } from "../../hooks/useNativeWorkspace";
import { useLocale } from "../../i18n/useLocale";
import {
  NativeAccess,
  NativeEvidence,
  NativeFacts,
  NativeFrame,
  NativeLedger,
  NativeStat,
} from "../../features/computer/NativePresentation";
import { taskName } from "../../features/computer/workflow";
import { downloadTaskJson } from "../../features/tasks/records";
import { ComputerPage } from "../ComputerPage";
import { ComputerApplications } from "../../components/ComputerApplications";

export function NativeModels() {
  const { t } = useLocale();
  const { model, system, metrics, device } = useNativeWorkspace();
  return (
    <div className="models-workspace native-design-page" data-design="models">
      <header className="models-heading">
        <div>
          <p className="models-eyebrow">
            {t("INTELLIGENCE / MODEL RUNTIME")}{" "}
            <span className="models-neutral">
              {t(model.data?.configured ? "Unverified" : "Not configured")}
            </span>
          </p>
          <h1>{t("AI Models & Multi-Modal Engines")}</h1>
          <p>
            {t(
              "Inspect the inference adapter, visual grounding and execution services behind INTI AI.",
            )}
          </p>
        </div>
        <div className="models-heading-actions">
          <Link to="/benchmarks">{t("View benchmarks")}</Link>
          <button
            className="models-primary"
            onClick={() => {
              void model.refetch();
              void system.refetch();
            }}
          >
            <RefreshCw size={14} />
            {t("Refresh diagnostics")}
          </button>
        </div>
      </header>
      <NativeAccess />
      <div className="models-metrics">
        {[
          "Model throughput",
          "Mean inference latency",
          "Dedicated GPU memory",
          "Grounding precision",
        ].map((label) => (
          <NativeStat
            key={label}
            label={label}
            value={t("Not measured")}
            note="No live-model benchmark is claimed."
          />
        ))}
      </div>
      <div className="models-layout">
        <div className="models-main">
          <header className="models-section-heading">
            <h2>
              <Layers3 size={18} />
              {t("Inference Architecture & Runtimes")}
            </h2>
          </header>
          <section className="models-card models-primary-adapter">
            <header>
              <span className="models-icon">
                <Eye size={24} />
              </span>
              <div className="models-card-title">
                <h2>{model.data?.model || "Meta"}</h2>
                <div className="models-tags">
                  <span className="models-tag">{t("PRIMARY ADAPTER")}</span>
                  <span className="models-tag">
                    {t(
                      model.data?.configured ? "Unverified" : "Not configured",
                    )}
                  </span>
                </div>
                <p>
                  {t(
                    "Model access is separate from the local execution agent.",
                  )}
                </p>
              </div>
              <Link className="models-guide" to="/system">
                {t("Configuration guide")}
              </Link>
            </header>
            <div className="models-facts">
              {[
                ["Provider", model.data?.provider || "Meta"],
                [
                  "Configuration",
                  t(model.data?.configured ? "Unverified" : "Not configured"),
                ],
                ["Recorded model calls", "0"],
                ["Planning source", t("Reviewed typed plan")],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{t(label)}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="models-route">
              <p className="models-eyebrow">{t("MODEL REQUEST POLICY")}</p>
              <h3>{t("Live-model calls disabled")}</h3>
              <p className="native-note">
                {t(
                  "Current local plans are explicitly authored. Live-model calls remain disabled; model planning and desktop visual reasoning have not been connected to this agent yet.",
                )}
              </p>
            </div>
            <div className="models-feature-row">
              <span>
                <ShieldCheck size={14} />
                {t("Explicit task permissions")}
              </span>
              <span>
                <Monitor size={14} />
                {t("Paired local agent")}
              </span>
            </div>
          </section>
          <section className="models-card models-grounding">
            <header>
              <span className="models-icon models-icon-secondary">
                <Eye size={22} />
              </span>
              <div>
                <h2>{t("Visual Grounding & Target Resolution")}</h2>
                <span className="models-tag models-gold">
                  {t("Pending local implementation")}
                </span>
              </div>
              <Link to="/observations">{t("Inspect captures")} ↗</Link>
            </header>
            <p className="native-note">
              {t("Desktop visual interpretation is pending for this agent.")}
            </p>
            <div className="models-grounding-checks">
              {[
                ["Identity", "Detected application catalog"],
                ["Geometry", "Unavailable"],
                ["Provenance", "Paired local agent"],
              ].map(([label, value]) => (
                <div key={label}>
                  <small>{t(label)}</small>
                  <strong>{t(value)}</strong>
                </div>
              ))}
            </div>
          </section>
          <div className="models-runtime-pair">
            <section className="models-card">
              <header>
                <Activity size={21} />
                <h2>{t("Local Execution Runtime")}</h2>
              </header>
              <p className="native-note">
                {t("Approved actions run through the paired Windows agent.")}
              </p>
              <dl className="native-design-facts">
                <dt>{t("Computer")}</dt>
                <dd>{device?.name || "—"}</dd>
                <dt>{t("Application launch requests")}</dt>
                <dd>{metrics.launches}</dd>
              </dl>
              <Link to="/execution">{t("View Live Execution")} ↗</Link>
            </section>
            <section className="models-card">
              <header>
                <ShieldCheck size={21} />
                <h2>{t("Verification service")}</h2>
              </header>
              <p className="native-note">
                {t(
                  "File readback checks the saved contents. An application launch receipt only records a launch request. Independent desktop visual verification is not yet available.",
                )}
              </p>
              <Link to="/verification">{t("Open Verification Lab")} ↗</Link>
            </section>
          </div>
        </div>
        <aside className="models-sidebar">
          <section className="models-card models-environment">
            <header>
              <Server size={19} />
              <h2>{t("Runtime Environment")}</h2>
              <span className="models-tag">{t("LOCAL")}</span>
            </header>
            <dl className="native-design-facts">
              <dt>{t("Backend")}</dt>
              <dd>{t(system.data?.backend ? "ONLINE" : "UNAVAILABLE")}</dd>
              <dt>{t("Database")}</dt>
              <dd>
                {t(system.data?.database ? "Connected" : "Not connected")}
              </dd>
              <dt>{t("Application version")}</dt>
              <dd>{system.data?.version || "—"}</dd>
              <dt>{t("GPU / VRAM telemetry")}</dt>
              <dd>{t("Unavailable")}</dd>
            </dl>
            <div className="models-credential-state">
              <h3>{t("Configuration")}</h3>
              <strong>
                {t(model.data?.configured ? "Unverified" : "Not configured")}
              </strong>
            </div>
          </section>
          <section className="models-card models-policy">
            <header>
              <Settings2 size={19} />
              <h2>{t("Routing & Permissions")}</h2>
            </header>
            <NativeFacts />
            <Link to="/system">{t("Settings")} ↗</Link>
          </section>
          <section className="models-card models-observation">
            <header>
              <Eye size={19} />
              <h2>{t("Recorded Visual Input")}</h2>
            </header>
            <NativeFrame compact />
            <p className="native-note">{t("No captured desktop frame")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function NativeSettings() {
  const { t } = useLocale();
  const {
    token,
    devices,
    device,
    setDeviceId,
    setSelectedId,
    query,
    model,
    system,
    catalog,
  } = useNativeWorkspace();
  const navigate = useNavigate();
  const [module, setModule] = useState("all");
  const show = (id: string) => module === "all" || module === id;
  return (
    <div
      className="settings-workspace native-design-page"
      data-design="settings"
    >
      <header className="settings-heading">
        <span className="settings-heading-icon">
          <Settings2 size={23} />
        </span>
        <div>
          <p className="settings-eyebrow">{t("SYSTEM / LOCAL WORKSPACE")}</p>
          <h1>{t("System Settings & Platform Configuration")}</h1>
          <p>
            {t(
              "Review model access, connected applications and local execution services.",
            )}
          </p>
        </div>
        <div className="settings-heading-actions">
          <button
            onClick={() =>
              downloadTaskJson("inti-local-diagnostics.json", {
                system: system.data,
                model: {
                  model: model.data?.model,
                  configured: model.data?.configured,
                  available: model.data?.available,
                },
              })
            }
          >
            <Download size={14} />
            {t("Export diagnostics")}
          </button>
          <button
            className="settings-primary"
            onClick={() => {
              void query.refetch();
              void model.refetch();
              void system.refetch();
            }}
          >
            <RefreshCw size={14} />
            {t("Refresh diagnostics")}
          </button>
        </div>
      </header>
      <nav className="settings-module-nav" aria-label={t("Settings modules")}>
        {[
          ["all", "All Modules"],
          ["general", "General & Access"],
          ["vision", "Vision & AI Models"],
          ["apps", "Connected Apps"],
          ["services", "Local services"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={module === id}
            onClick={() => setModule(id)}
          >
            <Layers3 size={15} />
            {t(label)}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        <aside className="settings-aside">
          <section className="settings-card settings-profile">
            <header>
              <Monitor size={21} />
              <h2>{t("Local Operator & Access")}</h2>
              <span className="settings-tag">{t("MEMORY ONLY")}</span>
            </header>
            <div className="settings-identity">
              <Monitor size={30} />
              <div>
                <strong>{t("Local operator")}</strong>
                <p>{t(token ? "Capability connected" : "Not connected")}</p>
              </div>
            </div>
            <NativeAccess />
            <Link to="/inventory">{t("Computers & Applications")} ↗</Link>
          </section>
          <section className="settings-card settings-calibration">
            <header>
              <Eye size={20} />
              <h2>{t("Vision Calibration")}</h2>
            </header>
            <strong>{t("Not measured")}</strong>
            <p className="native-note">
              {t("Desktop visual interpretation is pending for this agent.")}
            </p>
            <Link to="/benchmarks">{t("View benchmarks")}</Link>
          </section>
        </aside>
        <main className="settings-main">
          {(show("general") || show("vision")) && (
            <section className="settings-card settings-vision">
              <header>
                <Eye size={21} />
                <h2>{t("AI Vision & Grounding Configuration")}</h2>
                <span className="settings-tag">{t("READ ONLY")}</span>
              </header>
              <div className="settings-model-fields">
                {[
                  ["Primary vision model", model.data?.model || "—"],
                  [
                    "Provider configuration",
                    t(model.data?.configured ? "Unverified" : "Not configured"),
                  ],
                  ["Recorded model calls", "0"],
                  ["Secondary fallback", t("Not configured")],
                ].map(([label, value]) => (
                  <div key={label}>
                    <small>{t(label)}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="settings-grounding-note">
                <ShieldCheck size={19} />
                <div>
                  <h3>{t("Observation-bound visual grounding")}</h3>
                  <p className="native-note">
                    {t(
                      "Desktop visual interpretation is pending for this agent.",
                    )}
                  </p>
                  <Link to="/models">{t("AI Models")} ↗</Link>
                </div>
              </div>
              <div className="settings-permissions">
                {[
                  ["Task model requests", "Live-model calls disabled"],
                  ["Local Execution Runtime", "APPROVAL REQUIRED"],
                  ["Verification service", "Agent-reported evidence"],
                  ["Recovery service", "No automatic replay"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <ShieldCheck size={18} />
                    <span>{t(label)}</span>
                    <strong>{t(value)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          {(show("general") || show("apps")) && (
            <section className="settings-card settings-apps">
              <header>
                <Monitor size={21} />
                <h2>{t("Connected Apps & Inventory Integration")}</h2>
                <span className="settings-tag">{t("LOCAL")}</span>
              </header>
              {module === "apps" ? (
                <ComputerApplications
                  token={token}
                  devices={devices}
                  targetId={device?.id || ""}
                  onTarget={setDeviceId}
                  onPrepared={async (task) => {
                    setSelectedId(task.id);
                    await query.refetch();
                    navigate(`/planning?task=${task.id}`);
                  }}
                />
              ) : (
                <>
                  <div className="settings-app-target">
                    <span className="settings-app-icon">
                      <Monitor size={24} />
                    </span>
                    <div>
                      <h3>{device?.name || t("Not connected")}</h3>
                      <p>{t("Paired local agent")}</p>
                    </div>
                    <span className="settings-tag">
                      {device && Date.now() / 1000 - device.last_seen < 30
                        ? t("ONLINE")
                        : t("OFFLINE")}
                    </span>
                  </div>
                  <div className="settings-app-facts">
                    <div>
                      <span>{t("Connected computers")}</span>
                      <strong>{devices.length}</strong>
                    </div>
                    <div>
                      <span>{t("Detected application catalog")}</span>
                      <strong>{catalog?.applications.length ?? "—"}</strong>
                    </div>
                    <div>
                      <span>{t("Authorized folder")}</span>
                      <code>{device?.root || "—"}</code>
                    </div>
                  </div>
                  <div className="settings-app-actions">
                    <Link to="/computer">
                      {t("Applications on this computer")} ↗
                    </Link>
                    <button onClick={() => setModule("apps")}>
                      {t("Connected Apps")}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {(show("general") || show("services")) && (
            <section className="settings-card settings-sandbox">
              <header>
                <Server size={21} />
                <h2>{t("Local Agents, Services & Configuration")}</h2>
              </header>
              <div className="settings-sandbox-grid">
                <div>
                  <h3>{t("Model access")}</h3>
                  <strong>
                    {t(
                      model.data?.configured ? "Unverified" : "Not configured",
                    )}
                  </strong>
                  <p className="native-note">
                    {t(
                      "Model access is separate from the local execution agent.",
                    )}
                  </p>
                </div>
                <div>
                  <h3>{t("Service dependencies")}</h3>
                  <dl className="native-design-facts">
                    <dt>{t("Backend")}</dt>
                    <dd>
                      {t(system.data?.backend ? "ONLINE" : "UNAVAILABLE")}
                    </dd>
                    <dt>{t("Database")}</dt>
                    <dd>
                      {t(system.data?.database ? "Connected" : "Not connected")}
                    </dd>
                  </dl>
                </div>
                <div>
                  <h3>{t("Session controls")}</h3>
                  <p className="native-note">
                    {t(
                      "Approval is tied to the exact manifest digest. Preparation never starts an action.",
                    )}
                  </p>
                  <Link to="/execution">{t("View Live Execution")} ↗</Link>
                </div>
              </div>
            </section>
          )}
          {show("apps") && (
            <section className="settings-card">
              <header>
                <ShieldCheck size={20} />
                <h2>{t("Computers & Permissions")}</h2>
              </header>
              <ComputerPage view="settings" presentation="permissions" />
            </section>
          )}
        </main>
      </div>
      <p className="settings-audit-note">
        {t(
          "Credentials remain private. No model call starts from viewing this page.",
        )}
      </p>
    </div>
  );
}

export function NativeAnalytics() {
  const { t } = useLocale();
  const { tasks, metrics, data, selected, query } = useNativeWorkspace();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const buckets = [
    "DRAFT",
    "QUEUED",
    "RUNNING",
    "COMPLETED",
    "FAILED",
    "INTERRUPTED",
    "CANCELLED",
  ].map((label) => ({
    label,
    count: tasks.filter((task) => task.status === label).length,
  }));
  const max = Math.max(1, ...buckets.map((item) => item.count));
  const filtered = tasks.filter(
    (task) =>
      (!status || task.status === status) &&
      `${taskName(task)} ${task.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div
      className="analytics-workspace native-design-page"
      data-design="analytics"
    >
      <header className="analytics-heading">
        <div className="analytics-heading-top">
          <div>
            <p className="analytics-eyebrow">
              <span>{t("RECORDED EVALUATION EVIDENCE")}</span>
              {t("LOCAL REPORTS / NO LIVE INFERENCE")}
            </p>
            <h1>{t("Analytics & Benchmarks")}</h1>
            <p>
              {t(
                "Inspect measured local task records with their original scope and denominators.",
              )}
            </p>
          </div>
          <div className="analytics-heading-actions">
            <button
              onClick={() =>
                downloadTaskJson("inti-local-metrics.json", {
                  scope: "Latest 100 local tasks",
                  metrics,
                  tasks,
                })
              }
            >
              <Download size={14} />
              {t("Export report JSON")}
            </button>
            <button
              className="analytics-primary"
              disabled={!data}
              onClick={() => void query.refetch()}
            >
              <RefreshCw size={14} />
              {t("Refresh")}
            </button>
          </div>
        </div>
        <div className="analytics-source-controls">
          <span>{t("Evaluation source")}</span>
          <strong>{t("Paired local agent")}</strong>
          <span>{t("Methodology")}</span>
          <strong>{t("Recorded task ledger")}</strong>
        </div>
      </header>
      <NativeAccess />
      <div className="analytics-scope">
        <ShieldCheck size={18} />
        <p>
          {t(
            "Metrics use the latest 100 local task records. Completed tasks are not automatically independent verification successes. No live-model benchmark is claimed.",
          )}
        </p>
      </div>
      <div className="analytics-metrics">
        <NativeStat label="Loaded tasks" value={data ? metrics.total : "—"} />
        <NativeStat
          label="Successful executions"
          value={data ? metrics.completed : "—"}
          note="Execution completion and verification remain separate."
        />
        <NativeStat
          label="File readbacks"
          value={data ? metrics.fileReadbacks : "—"}
        />
        <NativeStat
          label="Application launch requests"
          value={data ? metrics.launches : "—"}
        />
      </div>
      <div className="analytics-analysis-grid">
        <section className="analytics-card analytics-chart-panel">
          <header>
            <Activity size={20} />
            <div>
              <h2>{t("Recorded task outcomes")}</h2>
              <p>
                {t(
                  "Counts in the loaded history, not latency or model performance.",
                )}
              </p>
            </div>
            <span className="analytics-tag">
              {tasks.length} {t("Loaded tasks")}
            </span>
          </header>
          <div className="analytics-latency-chart">
            <div className="analytics-chart-caption">
              <span>{t("Recorded samples")}</span>
              <strong>{tasks.length}</strong>
            </div>
            <svg
              className="native-outcome-chart"
              viewBox="0 0 760 300"
              role="img"
              aria-label={t("Recorded task outcomes")}
            >
              {[0, 1, 2].map((n) => (
                <line
                  key={n}
                  x1="30"
                  y1={30 + n * 105}
                  x2="740"
                  y2={30 + n * 105}
                  stroke="var(--border-subtle)"
                  strokeDasharray="4 5"
                />
              ))}
              {buckets.map((item, index) => {
                const height = (item.count / max) * 210;
                return (
                  <g key={item.label}>
                    <rect
                      x={50 + index * 96}
                      y={240 - height}
                      width="60"
                      height={height}
                      rx="3"
                      fill={
                        status === item.label
                          ? "var(--solar)"
                          : "var(--primary)"
                      }
                      opacity={status && status !== item.label ? 0.35 : 0.8}
                    />
                    <text
                      x={80 + index * 96}
                      y={225 - height}
                      fill="var(--text-secondary)"
                      textAnchor="middle"
                      fontSize="13"
                    >
                      {item.count}
                    </text>
                    <text
                      x={80 + index * 96}
                      y="266"
                      fill="var(--text-muted)"
                      textAnchor="middle"
                      fontSize="10"
                    >
                      {index + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="native-chart-legend">
              {buckets.map((item, index) => (
                <button
                  key={item.label}
                  aria-pressed={status === item.label}
                  onClick={() =>
                    setStatus(status === item.label ? "" : item.label)
                  }
                >
                  {index + 1}. {t(item.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="analytics-chart-inspector">
            <h3>{selected ? taskName(selected) : t("No record selected")}</h3>
            <p>{selected ? t(selected.status) : "—"}</p>
          </div>
        </section>
        <aside className="analytics-card analytics-coverage">
          <header>
            <Layers3 size={18} />
            <h2>{t("Evaluation Sources")}</h2>
          </header>
          <p>{t("Recorded task ledger")}</p>
          <dl className="native-design-facts">
            <dt>{t("Recorded model calls")}</dt>
            <dd>0</dd>
            <dt>{t("Avg execution time")}</dt>
            <dd>{t("Not measured")}</dd>
            <dt>{t("Recovery success rate")}</dt>
            <dd>{t("Not measured")}</dd>
            <dt>{t("Independent outcome")}</dt>
            <dd>{t("Unavailable")}</dd>
          </dl>
          <p className="native-note">
            {t(
              "Counts in the loaded history, not latency or model performance.",
            )}
          </p>
        </aside>
      </div>
      <section className="analytics-card analytics-results">
        <header>
          <Activity size={20} />
          <h2>{t("Breakdown by Task & Recorded Outcome")}</h2>
        </header>
        <div className="analytics-table-filters">
          <label>
            <Search size={14} />
            <input
              aria-label={t("Search tasks")}
              value={search}
              placeholder={t("Search tasks")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            aria-label={t("Recorded outcome")}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">{t("All states")}</option>
            {buckets.map((item) => (
              <option key={item.label} value={item.label}>
                {t(item.label)}
              </option>
            ))}
          </select>
        </div>
        <NativeLedger records={filtered} />
      </section>
      <section className="analytics-card analytics-methodology">
        <header>
          <ShieldCheck size={20} />
          <h2>{t("Source, Methodology & Measurement Boundaries")}</h2>
        </header>
        <p>
          {t(
            "Metrics use the latest 100 local task records. Completed tasks are not automatically independent verification successes. No live-model benchmark is claimed.",
          )}
        </p>
      </section>
    </div>
  );
}

export function NativeActivity() {
  const { t, dateLocale } = useLocale();
  const {
    tasks,
    selected,
    setSelectedId,
    metrics,
    data,
    query,
    polling,
    setPolling,
  } = useNativeWorkspace();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [compact, setCompact] = useState(false);
  const filtered = tasks.filter(
    (task) =>
      (!status || task.status === status) &&
      `${taskName(task)} ${task.id} ${task.status}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div
      className={`activity-workspace native-design-page ${compact ? "activity-compact" : ""}`}
      data-design="activity"
    >
      <header className="activity-heading">
        <div>
          <p className="activity-eyebrow">
            {t("PERSISTED SYSTEM RECORDS")}{" "}
            <span>{t("RECENT-WINDOW INSPECTION")}</span>
          </p>
          <h1>{t("System & Agent Activity Logs")}</h1>
          <p>
            {t(
              "Inspect recorded local tasks and receipts with their source and timestamp.",
            )}
          </p>
        </div>
        <div className="activity-heading-actions">
          <button onClick={() => setPolling(!polling)}>
            {polling ? <Pause size={14} /> : <Play size={14} />}{" "}
            {t(polling ? "Pause auto-refresh" : "Resume auto-refresh")}
          </button>
          <button
            onClick={() =>
              downloadTaskJson("inti-local-activity.json", {
                scope: "Latest local task snapshots",
                tasks: filtered,
              })
            }
          >
            <Download size={14} />
            {t("Export JSON")}
          </button>
        </div>
      </header>
      <NativeAccess />
      <div className="activity-metrics">
        {[
          ["Loaded records", metrics.total],
          ["Successful executions", metrics.completed],
          ["Tasks requiring attention", metrics.attention],
          ["File readbacks", metrics.fileReadbacks],
          ["Application launch requests", metrics.launches],
        ].map(([label, value]) => (
          <NativeStat
            key={label}
            label={String(label)}
            value={data ? value : "—"}
          />
        ))}
      </div>
      <div className="activity-filters">
        <label>
          <Search size={15} />
          <input
            aria-label={t("Search activity")}
            placeholder={t("Search activity")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          {t("Event source")}
          <select aria-label={t("Event source")}>
            <option>{t("Recorded task ledger")}</option>
          </select>
        </label>
        <label>
          {t("Status")}
          <select
            aria-label={t("Activity status")}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">{t("All states")}</option>
            {[...new Set(tasks.map((task) => task.status))].map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="activity-scope">
        {t(
          "Creation and latest update times come from the task ledger. Individual action timestamps are not available.",
        )}
      </p>
      <div className="activity-layout">
        <section className="activity-feed">
          <header>
            <strong>
              {filtered.length} / {tasks.length} {t("Loaded records")}
            </strong>
            <div>
              <button
                aria-pressed={compact}
                onClick={() => setCompact(!compact)}
              >
                {t("Compact view")}
              </button>
              <button disabled={!data} onClick={() => void query.refetch()}>
                <RefreshCw size={13} />
                {t("Refresh")}
              </button>
            </div>
          </header>
          <div className="activity-event-list">
            {filtered.map((task) => (
              <article
                key={task.id}
                className={selected?.id === task.id ? "activity-selected" : ""}
              >
                <div className="activity-event-top">
                  <time>
                    {new Date(task.updated_at * 1000).toLocaleString(
                      dateLocale,
                    )}
                  </time>
                  <span className="activity-source">
                    {t("Paired local agent")}
                  </span>
                  <button onClick={() => setSelectedId(task.id)}>
                    {t("Inspect record")} →
                  </button>
                </div>
                <h2>{taskName(task)}</h2>
                <p>
                  {t("Status")}: {t(task.status)} ·{" "}
                  {task.result?.steps.length || 0}{" "}
                  {t("recorded action receipts")}
                </p>
                <div className="activity-event-identity">
                  <span>{t("Task")}</span>
                  <code>{task.id}</code>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <p className="activity-empty">
              {t("No action evidence available yet.")}
            </p>
          )}
        </section>
        <aside className="activity-sidebar">
          <section className="activity-inspector">
            <p className="activity-eyebrow">{t("LOG DEEP DIVE")}</p>
            <header>
              <h2>{t("Event Inspector")}</h2>
              <span className="activity-tag">{t("RECORDED")}</span>
            </header>
            <code className="activity-inspector-id">{selected?.id || "—"}</code>
            <NativeFacts />
            <div className="activity-frame-note">
              <Eye size={23} />
              <strong>{t("Frame not included")}</strong>
              <p>
                {t(
                  "No desktop screenshot has been captured. Application icons are not screen observations.",
                )}
              </p>
            </div>
            <h3 className="activity-json-heading">
              <Terminal size={14} />
              {t("Event Metadata JSON")}
            </h3>
            <pre className="native-json">
              {JSON.stringify(selected || {}, null, 2)}
            </pre>
            <NativeEvidence />
          </section>
          <section className="activity-feed-status">
            <header>
              <RefreshCw size={17} />
              <h2>{t("Feed Scope & Refresh")}</h2>
            </header>
            <p className="native-note">
              {t(
                "Pausing affects this view's automatic reads only. Agent execution continues.",
              )}
            </p>
            <strong>
              {t(polling ? "Auto-refresh active" : "Auto-refresh paused")}
            </strong>
          </section>
        </aside>
      </div>
    </div>
  );
}
