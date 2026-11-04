import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Camera,
  CheckCircle2,
  Circle,
  Download,
  Eye,
  Monitor,
  RefreshCw,
  Search,
  ShieldCheck,
  Workflow,
  Wrench,
} from "lucide-react";
import { useLocale } from "../../i18n/useLocale";
import { useNativeWorkspace } from "../../hooks/useNativeWorkspace";
import {
  NativeAccess,
  NativeEvidence,
  NativeExport,
  NativeFacts,
  NativeFrame,
  NativeLedger,
  NativeStat,
  NativeTaskPicker,
} from "../../features/computer/NativePresentation";
import { recoveryCandidate, taskName } from "../../features/computer/workflow";
import { computerApi, type ComputerTask } from "../../services/computerApi";
import { errorMessage } from "../../services/api";
import { downloadTaskJson } from "../../features/tasks/records";
import { ComputerApplications } from "../../components/ComputerApplications";

export function NativeObservations() {
  const { t, dateLocale } = useLocale();
  const { catalog, device, devices, setDeviceId, selected, applications } =
    useNativeWorkspace();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("context");
  const apps = (catalog?.applications || []).filter((app) =>
    app.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div
      className="observations-workspace native-design-page"
      data-design="observations"
    >
      <header className="observations-heading">
        <div>
          <p className="observation-eyebrow">
            {t("PERCEPTION WORKSPACE / CAPTURED EVIDENCE")}
          </p>
          <h1>{t("Visual Observations")}</h1>
          <p>
            {t(
              "Explore recorded context, inspect targets and trace the evidence behind a plan.",
            )}
          </p>
        </div>
        <div className="observation-heading-actions">
          <span className="observation-stream">
            <Monitor size={21} />
            {device?.name || t("Not connected")}
          </span>
          <button
            className="button secondary"
            disabled
            title={t(
              "Desktop capture is not available yet. No demo frame is used.",
            )}
          >
            <Camera size={15} />
            {t("Capture observation")}
          </button>
        </div>
      </header>
      <NativeAccess />
      <div className="observations-toolbar">
        <label className="observation-search">
          <Search size={16} />
          <input
            aria-label={t("Search applications")}
            placeholder={t("Search applications")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="observation-filter-buttons">
          <button
            aria-pressed={tab === "context"}
            onClick={() => setTab("context")}
          >
            {t("Device context")}
          </button>
          <button
            aria-pressed={tab === "receipts"}
            onClick={() => setTab("receipts")}
          >
            {t("Action receipts")}
          </button>
        </div>
        <button
          className="observation-refresh"
          onClick={() => void applications.refetch()}
          disabled={!device}
          aria-label={t("Refresh")}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="observations-split">
        <section className="observation-viewer-card">
          <header className="observation-viewer-heading">
            <strong>{device?.name || "—"}</strong>
            <span className="observation-small-tag">{t("LOCAL")}</span>
          </header>
          {tab === "context" ? (
            <NativeFrame />
          ) : (
            <div className="native-observation-receipts">
              <NativeTaskPicker />
              <NativeEvidence />
            </div>
          )}
          <p className="observation-evidence-note">
            {t(
              "This is agent-reported context, not a visual screenshot or model inference.",
            )}
          </p>
        </section>
        <aside className="observations-panels">
          <section className="observation-panel">
            <header className="observation-panel-heading">
              <h2>{t("VIEWPORT TELEMETRY")}</h2>
            </header>
            <div className="observation-telemetry-grid">
              <div>
                <small>{t("Resolution")}</small>
                <strong>—</strong>
                <span>{t("No captured desktop frame")}</span>
              </div>
              <div>
                <small>{t("Capture mode")}</small>
                <strong>{t("Unavailable")}</strong>
                <span>{t("Paired local agent")}</span>
              </div>
            </div>
            <span className="observation-captured-at">
              {t("Last scan")}:{" "}
              {catalog?.scanned_at
                ? new Date(catalog.scanned_at * 1000).toLocaleString(dateLocale)
                : "—"}
            </span>
          </section>
          <section className="observation-panel">
            <header className="observation-panel-heading">
              <h2>
                {t("Detected application catalog")} <span>{apps.length}</span>
              </h2>
            </header>
            <div className="native-application-context">
              {apps.slice(0, 8).map((app) => (
                <div key={app.id}>
                  <Monitor size={15} />
                  <span>
                    {app.name}
                    <small>{app.path}</small>
                  </span>
                </div>
              ))}
            </div>
            <Link to="/computer">{t("Applications on this computer")} →</Link>
          </section>
          <section className="observation-panel">
            <header className="observation-panel-heading">
              <h2>{t("PERCEPTION RECORD")}</h2>
            </header>
            <p className="native-note">
              {t(
                "No desktop screenshot has been captured. Application icons are not screen observations.",
              )}
            </p>
            <NativeFacts />
            <Link to={`/planning${selected ? "?task=" + selected.id : ""}`}>
              {t("Open AI Agent Studio")} →
            </Link>
          </section>
        </aside>
      </div>
      <section className="observations-recent">
        <header className="observations-recent-heading">
          <h2>{t("Recent Observations")}</h2>
          <span>{t("Connected computers")}</span>
        </header>
        <div className="observations-gallery">
          {devices.map((item) => (
            <article className="observation-card" key={item.id}>
              <button onClick={() => setDeviceId(item.id)}>
                <div className="native-device-thumbnail">
                  <Monitor size={33} />
                  <span>{t("Device context")}</span>
                </div>
                <h3>{item.name}</h3>
                <small>
                  {new Date(item.last_seen * 1000).toLocaleString(dateLocale)}
                </small>
              </button>
            </article>
          ))}
        </div>
        <p className="observation-footer-note">
          {t(
            "The local agent reports its connected device, authorized folder and detected application catalog. Desktop screenshots and visual interpretation are not yet implemented for this agent.",
          )}
        </p>
      </section>
    </div>
  );
}

export function NativeVerification() {
  const { t } = useLocale();
  const { selected, metrics, data } = useNativeWorkspace();
  const receipts = selected?.result?.steps || [];
  return (
    <div
      className="execution-workspace verification-workspace verification-lab native-design-page"
      data-design="verification"
    >
      <header className="verification-heading">
        <div>
          <p className="verification-kicker">
            <span>{t("Paired local agent")}</span>
            {t("OUTCOME VALIDATION")}
          </p>
          <h1>{t("Verification Lab")}</h1>
          <p>
            {t(
              "Inspect the result against the recorded contract and its evidence.",
            )}
          </p>
        </div>
        <div className="verification-heading-actions">
          <NativeExport />
        </div>
      </header>
      <NativeAccess />
      <div className="verification-lab-metrics">
        <section>
          <div>
            <span>{t("Contract actions")}</span>
            <CheckCircle2 size={20} />
          </div>
          <strong>{selected?.steps.length ?? "—"}</strong>
          <p>{t("Reviewed typed plan")}</p>
          <div className="verification-metric-rule verification-metric-green" />
        </section>
        <section>
          <div>
            <span>{t("Evidence collected")}</span>
            <ShieldCheck size={20} />
          </div>
          <strong>{selected ? receipts.length : "—"}</strong>
          <p>{t("Agent-reported evidence")}</p>
          <div className="verification-metric-rule verification-metric-cyan" />
        </section>
        <section>
          <div>
            <span>{t("Independent outcome")}</span>
            <Eye size={20} />
          </div>
          <strong>—</strong>
          <p>{t("No independent visual verdict")}</p>
          <div className="verification-metric-rule verification-metric-gold" />
        </section>
      </div>
      <section className="execution-panel">
        <header>
          <h2>{t("End-to-End Verification Flow")}</h2>
          <span className="verification-label">{t("READ ONLY")}</span>
        </header>
        <div className="verification-stages">
          {[
            ["Reviewed contract", "Exact application and manifest digest"],
            ["Recorded evidence", "Agent-reported evidence"],
            ["Criteria evaluation", "File readbacks"],
            ["Integrity & verdict", "No independent visual verdict"],
          ].map(([title, note], index) => (
            <article key={title}>
              <div>
                {String(index + 1).padStart(2, "0")}
                <ShieldCheck size={18} />
              </div>
              <h3>{t(title)}</h3>
              <p>{t(note)}</p>
              <code>
                {index === 0
                  ? selected?.digest.slice(0, 12) || "—"
                  : index === 1
                    ? receipts.length
                    : index === 2
                      ? metrics.fileReadbacks
                      : "—"}
              </code>
            </article>
          ))}
        </div>
      </section>
      <div className="verification-section-heading">
        <div>
          <p className="verification-kicker">
            {t("INDEPENDENT PROOF INSPECTION")}
          </p>
          <h2>{t("State Differential Engine")}</h2>
        </div>
        <NativeTaskPicker />
      </div>
      <section className="execution-panel">
        <header>
          <h2>
            {selected
              ? taskName(selected)
              : t("No action evidence available yet.")}
          </h2>
          <span className="verification-label">
            {selected ? t(selected.status) : "—"}
          </span>
        </header>
        <p className="native-note">
          {t(
            "File readback checks the saved contents. An application launch receipt only records a launch request. Independent desktop visual verification is not yet available.",
          )}
        </p>
      </section>
      <div className="verification-proof-grid">
        <section className="execution-panel">
          <h2>{t("Criteria inspector")}</h2>
          <div className="verification-criteria">
            {selected?.steps.map((step) => {
              const receipt = receipts.find((item) => item.id === step.id);
              return (
                <article className="native-criterion" key={step.id}>
                  <header>
                    <h3>{t(step.action)}</h3>
                    <span className="verification-label">
                      {t(receipt?.status || "PENDING")}
                    </span>
                  </header>
                  <dl className="native-design-facts">
                    <dt>{t("Expected target")}</dt>
                    <dd>{step.target}</dd>
                    <dt>{t("Observed evidence")}</dt>
                    <dd>{receipt?.path || receipt?.url || "—"}</dd>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
        <section className="execution-panel">
          <h2>{t("Evidence viewer")}</h2>
          <NativeEvidence />
          <NativeFrame compact />
          <details className="verification-provenance">
            <summary>{t("Evidence provenance & SHA-256")}</summary>
            <pre className="native-json">
              {JSON.stringify(receipts, null, 2)}
            </pre>
          </details>
        </section>
      </div>
      <section className="execution-panel">
        <h2>{t("Execution vs verification")}</h2>
        <div className="native-triple-cards">
          <div>
            <small>{t("Reviewed contract")}</small>
            <strong>
              {selected?.steps.length || 0} {t("typed actions")}
            </strong>
          </div>
          <div>
            <small>{t("What the agent reported")}</small>
            <strong>{selected ? t(selected.status) : "—"}</strong>
          </div>
          <div>
            <small>{t("Independent outcome")}</small>
            <strong>{t("Unavailable")}</strong>
          </div>
        </div>
      </section>
      <section className="execution-panel">
        <header>
          <h2>{t("Audit ledger")}</h2>
          <span className="verification-label">
            {data ? metrics.total : "—"} {t("Loaded tasks")}
          </span>
        </header>
        <NativeLedger />
      </section>
    </div>
  );
}

export function NativeRecovery() {
  const { t, dateLocale } = useLocale();
  const { token, tasks, data, selected, setSelectedId, query } =
    useNativeWorkspace();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cases = tasks.filter(recoveryCandidate);
  const current = cases.find((item) => item.id === selected?.id) || cases[0];
  const prepare = async () => {
    if (
      !current ||
      !window.confirm(
        t(
          "Prepare a new draft from this task? Previous files and windows remain. Review all actions before approving.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      let draft: ComputerTask;
      if (current.plan.kind === "open_application") {
        const catalog = await computerApi.applications(
          token,
          current.device_id,
        );
        const app = catalog.applications.find(
          (item) =>
            item.id === current.plan.application?.id &&
            item.identity === current.plan.application.identity &&
            item.allowed,
        );
        if (!app)
          throw new Error(
            "Application is not authorized or its catalog is stale",
          );
        draft = await computerApi.prepareApplication(
          token,
          current.device_id,
          app,
        );
      } else {
        draft = await computerApi.prepare(token, {
          device_id: current.device_id,
          filename: current.plan.filename,
          content: current.plan.content,
          url: current.plan.url,
        });
      }
      await query.refetch();
      navigate(`/planning?task=${draft.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const stages = [
    [
      "Structured failure detected",
      current?.result?.error || "Awaiting an execution failure",
      !!current,
    ],
    ["Recorded diagnosis", "No diagnosis recorded", false],
    ["Proposed bounded repair", "Prepare a new reviewed draft", false],
    ["Authorization boundary", "Renewed approval required", false],
    ["Attempts and immediate checks", "No automatic replay", false],
  ] as const;
  return (
    <div
      className="execution-workspace recovery-center-workspace native-design-page"
      data-design="recovery"
    >
      <header className="recovery-center-heading">
        <div>
          <div className="recovery-heading-tags">
            <span>{t("SELF-HEALING ENGINE")}</span>
            <small>{t("BOUNDED RECOVERY")}</small>
          </div>
          <h1>{t("Recovery Center")}</h1>
          <p>
            {t(
              "Inspect failures, evidence-backed repair proposals and renewed authorization.",
            )}
          </p>
        </div>
        <div className="recovery-protocol-badge">
          <Wrench size={24} />
          <div>
            <span>{t("EVIDENCE & POLICY")}</span>
            <strong>
              {t(
                current ? "Tasks requiring attention" : "Waiting for evidence",
              )}
            </strong>
          </div>
        </div>
      </header>
      <NativeAccess />
      <div className="recovery-center-metrics">
        <NativeStat
          label="Tasks requiring attention"
          value={data ? cases.length : "—"}
        />
        <NativeStat
          label="Recovery success rate"
          value="—"
          note="No recovery-rate benchmark available"
        />
        <NativeStat
          label="Mean session time"
          value="—"
          note="Action duration is not reported by this agent."
        />
        <NativeStat
          label="Automatic replays"
          value="0"
          note="No automatic replay"
        />
      </div>
      <div className="recovery-session-toolbar">
        <label>
          {t("Recovery History")}
          <select
            aria-label={t("Recovery History")}
            value={current?.id || ""}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="" disabled>
              {t("No recovery records yet")}
            </option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {taskName(item)} · {t(item.status)}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!token} onClick={() => void query.refetch()}>
          <RefreshCw size={14} />
        </button>
      </div>
      {error && (
        <p className="execution-error" role="alert">
          {t(error)}
        </p>
      )}
      {!current && (
        <p className="recovery-empty-notice">
          {t("No failed, interrupted or canceled tasks in the loaded history.")}
        </p>
      )}
      <section className="recovery-case">
        <header className="recovery-case-heading">
          <div>
            <Wrench size={24} />
            <div>
              <h2>
                {t("Recovery Case")} ·{" "}
                {current ? taskName(current) : t("No record selected")}
              </h2>
              <p>{current?.id || t("Waiting for evidence")}</p>
            </div>
          </div>
          <span className="recovery-case-state">
            {current ? t(current.status) : t("AWAITING EVIDENCE")}
          </span>
        </header>
        <div className="recovery-comparison-grid">
          <section className="recovery-evidence">
            <header>
              <h3>{t("Captured baseline")}</h3>
            </header>
            <NativeFrame compact />
            <p className="native-note">
              {t(
                "No desktop screenshot has been captured. Application icons are not screen observations.",
              )}
            </p>
          </section>
          <section className="recovery-pipeline">
            <header>
              <h3>
                <Workflow size={15} />
                {t("RECOVERY PIPELINE")}
              </h3>
            </header>
            <ol>
              {stages.map(([title, note, recorded], index) => (
                <li
                  className={recorded ? "recorded" : "unrecorded"}
                  key={title}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{t(title)}</strong>
                    <p>{t(note)}</p>
                  </div>
                  {recorded ? <CheckCircle2 size={14} /> : <Circle size={13} />}
                </li>
              ))}
            </ol>
            <p className="recovery-small-note">
              {t(
                "Interrupted actions are never replayed automatically. Inspect the recorded steps and existing files before preparing a new reviewed draft.",
              )}
            </p>
          </section>
          <section className="recovery-evidence">
            <header>
              <h3>{t("Fresh recovery observation")}</h3>
            </header>
            <NativeFrame compact />
            <p className="native-note">{t("Waiting for evidence")}</p>
          </section>
        </div>
        <div className="recovery-case-controls">
          <button disabled={!current || busy} onClick={() => void prepare()}>
            {t("Prepare a new reviewed draft")}
          </button>
          <Link to={current ? `/execution?task=${current.id}` : "/execution"}>
            {t("Inspect original execution")} →
          </Link>
        </div>
      </section>
      <div className="recovery-lower-grid">
        <div className="recovery-left-column">
          <section className="execution-panel">
            <h2>{t("Recovery Execution Log")}</h2>
            {current ? (
              <>
                <p>
                  {new Date(current.updated_at * 1000).toLocaleString(
                    dateLocale,
                  )}
                </p>
                <pre className="native-json">
                  {JSON.stringify(current.result, null, 2)}
                </pre>
              </>
            ) : (
              <p className="native-note">
                {t("No action evidence available yet.")}
              </p>
            )}
          </section>
          <section className="execution-panel">
            <h2>{t("Recorded Diagnoses")}</h2>
            <p className="native-note">{t("No diagnosis recorded")}</p>
          </section>
        </div>
        <section className="execution-panel">
          <h2>{t("Audit & Proof Strategy")}</h2>
          <p className="native-note">
            {current?.result?.error || t("No error receipt available.")}
          </p>
          <p className="native-note">{t("No automatic replay")}</p>
          <p className="native-note">
            {t("Execution completion and verification remain separate.")}
          </p>
          {current && (
            <button
              onClick={() =>
                downloadTaskJson(`inti-recovery-${current.id}.json`, current)
              }
            >
              <Download size={14} />
              {t("Export receipt")}
            </button>
          )}
        </section>
      </div>
      <section className="execution-panel recovery-repair-plan">
        <h2>{t("Proposed Repair & Authorization")}</h2>
        <p className="native-note">
          {t(
            "Preparation never authorizes an action. A new draft requires exact approval in AI Agent Studio.",
          )}
        </p>
      </section>
    </div>
  );
}

export function NativeHardware() {
  const { t, dateLocale } = useLocale();
  const navigate = useNavigate();
  const {
    token,
    devices,
    device,
    setDeviceId,
    data,
    query,
    catalog,
    applications,
  } = useNativeWorkspace();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const online = (time: number) => Date.now() / 1000 - time < 30;
  const visible = devices.filter(
    (item) =>
      `${item.name} ${item.id} ${item.root}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!status || (online(item.last_seen) ? "ONLINE" : "OFFLINE") === status),
  );
  const focused = device;
  return (
    <div
      className="inventory-workspace native-design-page"
      data-design="hardware"
    >
      <header className="inventory-heading">
        <div>
          <p className="inventory-eyebrow">
            INTI AI / {t("CONNECTED COMPUTERS")}{" "}
            <span className="inventory-connected">{t("LOCAL")}</span>
          </p>
          <h1>{t("Computers & Applications")}</h1>
          <p>
            {t(
              "Manage connected computers, detected applications and the permissions you grant INTI.",
            )}
          </p>
        </div>
        <div className="inventory-heading-actions">
          <button
            disabled={!data}
            onClick={() => {
              void query.refetch();
              void applications.refetch();
            }}
          >
            <RefreshCw size={14} />
            {t("Refresh")}
          </button>
          <a className="inventory-open-sandbox" href="#computer-applications">
            {t("Manage application permissions")}
          </a>
          <Link to="/computer/permissions">{t("Pair a Windows agent")}</Link>
        </div>
      </header>
      <NativeAccess />
      <div className="inventory-metrics">
        <NativeStat
          label="Paired computers"
          note="Active device registrations."
          value={data ? devices.length : "—"}
          icon={<Monitor size={20} />}
        />
        <NativeStat
          label="Detected applications"
          note="Catalog of the selected computer."
          value={catalog ? catalog.applications.length : "—"}
        />
        <NativeStat
          label="Authorized applications"
          note="Launch permissions on the selected computer."
          value={
            catalog
              ? catalog.applications.filter((app) => app.allowed).length
              : "—"
          }
          icon={<CheckCircle2 size={20} />}
        />
      </div>
      <div className="inventory-toolbar">
        <label className="inventory-search">
          <Search size={15} />
          <input
            aria-label={t("Search computers")}
            placeholder={t("Search computers")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label={t("Computer status")}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t("All states")}</option>
          <option value="ONLINE">{t("ONLINE")}</option>
          <option value="OFFLINE">{t("OFFLINE")}</option>
        </select>
      </div>
      <div className="inventory-layout">
        <section className="inventory-ledger">
          <header>
            <h2>{t("Paired computers")}</h2>
            <span>
              {visible.length} {t("Connected computers")}
            </span>
          </header>
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>{t("Computer")}</th>
                  <th>{t("Platform")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Last heartbeat")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      focused?.id === item.id ? "inventory-row-selected" : ""
                    }
                  >
                    <td>
                      <button
                        className="inventory-select-asset"
                        onClick={() => setDeviceId(item.id)}
                      >
                        <span className="inventory-asset-icon">
                          <Monitor size={20} />
                        </span>
                        <span>
                          {item.name}
                          <small>#{item.id.slice(0, 8)}</small>
                        </span>
                      </button>
                    </td>
                    <td>{item.platform}</td>
                    <td>{t(online(item.last_seen) ? "ONLINE" : "OFFLINE")}</td>
                    <td>
                      {new Date(item.last_seen * 1000).toLocaleString(
                        dateLocale,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="native-note">
                {t("No computers match your search.")}
              </p>
            )}
          </div>
          <p className="inventory-pagination">
            {visible.length} / {devices.length}
          </p>
        </section>
        <aside className="inventory-inspector">
          <section className="inventory-inspection-card">
            <header>
              <h2>{t("Selected computer")}</h2>
            </header>
            <div className="inventory-selected-heading">
              <Monitor size={28} />
              <div>
                <h3>{focused?.name || "—"}</h3>
                <small>{focused?.id}</small>
              </div>
            </div>
            <dl className="native-design-facts">
              <dt>{t("Platform")}</dt>
              <dd>{focused?.platform || "—"}</dd>
              <dt>{t("Status")}</dt>
              <dd>
                {focused
                  ? t(online(focused.last_seen) ? "ONLINE" : "OFFLINE")
                  : "—"}
              </dd>
            </dl>
            <p className="inventory-section-label">
              {t("Authorized workspace")}
            </p>
            <code className="native-workspace-path">
              {focused?.root || "—"}
            </code>
            <p className="native-note">
              {t(
                "Select a computer to manage its applications. Detection does not grant permission to launch them.",
              )}
            </p>
            <div className="inventory-inspector-actions">
              <button
                disabled={!focused}
                onClick={() =>
                  focused &&
                  downloadTaskJson(`inti-device-${focused.id}.json`, focused)
                }
              >
                <Download size={14} />
                {t("Download record")}
              </button>
              <Link to="/computer/permissions">
                {t("Computers & Permissions")}
              </Link>
            </div>
          </section>
          <section className="inventory-inspection-card">
            <h2>{t("Local access boundaries")}</h2>
            <p className="native-note">
              {t(
                "INTI can create new text files only in the authorized workspace. Application permissions allow preparing launches; each task requires your approval.",
              )}
            </p>
            <Link to="/computer/permissions">
              {t("Computers & Permissions")} →
            </Link>
          </section>
        </aside>
      </div>
      <section
        id="computer-applications"
        className="native-device-applications"
      >
        <ComputerApplications
          token={token}
          devices={devices}
          targetId={focused?.id || ""}
          onTarget={setDeviceId}
          onPrepared={(task) => navigate(`/planning?task=${task.id}`)}
        />
      </section>
    </div>
  );
}
