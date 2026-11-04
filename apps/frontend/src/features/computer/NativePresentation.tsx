import type { ReactNode } from "react";
import {
  Camera,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Download,
  Activity,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useNativeWorkspace } from "../../hooks/useNativeWorkspace";
import { useLocale } from "../../i18n/useLocale";
import { OperatorConnection } from "../../components/OperatorConnection";
import { errorMessage } from "../../services/api";
import { taskName } from "./workflow";
import { downloadTaskJson } from "../tasks/records";
import type { ComputerTask } from "../../services/computerApi";

export function NativeAccess() {
  const { token, query } = useNativeWorkspace();
  const { t } = useLocale();
  return (
    <>
      <details className="native-design-access" open={!token}>
        <summary>
          {t(
            token
              ? "Operator access loaded · Manage connection"
              : "Connect your operator capability",
          )}
        </summary>
        <OperatorConnection />
      </details>
      {query.isError && (
        <p role="alert" className="error">
          {t(errorMessage(query.error))}
        </p>
      )}
    </>
  );
}
export function NativePanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <section className={`native-design-panel ${className}`}>
      <header>
        <h2>{t(title)}</h2>
      </header>
      {children}
    </section>
  );
}
export function NativeFrame({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  const { device } = useNativeWorkspace();
  return (
    <div
      className={`native-design-frame ${compact ? "native-frame-compact" : ""}`}
    >
      <div className="native-frame-bar">
        <i />
        <i />
        <i />
        <code>{device?.name || t("Not connected")}</code>
        <span>{t("Paired local agent")}</span>
      </div>
      <div className="native-frame-content">
        <Camera size={36} />
        <strong>
          {t(
            "No desktop screenshot has been captured. Application icons are not screen observations.",
          )}
        </strong>
        <p>
          {t("Desktop capture is not available yet. No demo frame is used.")}
        </p>
        <Link to="/computer">{t("Applications on this computer")}</Link>
      </div>
    </div>
  );
}
export function NativeTaskPicker({
  label = "Selected computer task",
}: {
  label?: string;
}) {
  const { t } = useLocale();
  const { selected, tasks, setSelectedId, query, token } = useNativeWorkspace();
  return (
    <div className="native-task-picker">
      <ShieldCheck size={15} />
      <label>
        {t(label)}
        <select
          aria-label={t(label)}
          value={selected?.id || ""}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="" disabled>
            {t("No action evidence available yet.")}
          </option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {taskName(task)} · {t(task.status)}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!token || query.isFetching}
        onClick={() => void query.refetch()}
        aria-label={t("Refresh")}
      >
        <RefreshCw size={15} />
      </button>
    </div>
  );
}
export function NativeFacts() {
  const { selected, device } = useNativeWorkspace();
  const { t, dateLocale } = useLocale();
  return (
    <dl className="native-design-facts">
      <dt>{t("Computer")}</dt>
      <dd>{device?.name || "—"}</dd>
      <dt>{t("Status")}</dt>
      <dd>{selected ? t(selected.status) : "—"}</dd>
      <dt>{t("Latest update")}</dt>
      <dd>
        {selected
          ? new Date(selected.updated_at * 1000).toLocaleString(dateLocale)
          : "—"}
      </dd>
      <dt>{t("Planning source")}</dt>
      <dd>{t("Authored sample · 0 model calls")}</dd>
    </dl>
  );
}
export function NativeEvidence() {
  const { selected } = useNativeWorkspace();
  const { t } = useLocale();
  return (
    <>
      {selected?.result?.steps.map((step) => (
        <article className="native-receipt" key={step.id}>
          <strong>{t(step.status)}</strong>
          {step.path && <code>{step.path}</code>}
          {step.sha256 && <code>SHA-256 {step.sha256}</code>}
          {step.url && <code>{step.url}</code>}
          {step.pid && <span>PID {step.pid}</span>}
        </article>
      ))}
      {!selected?.result?.steps.length && (
        <p className="native-note">{t("No action evidence available yet.")}</p>
      )}
      <p className="native-note">
        {t(
          "File readback checks the saved contents. An application launch receipt only records a launch request. Independent desktop visual verification is not yet available.",
        )}
      </p>
    </>
  );
}
export function NativeLedger({
  className = "",
  records,
}: {
  className?: string;
  records?: ComputerTask[];
}) {
  const { tasks, selected, setSelectedId } = useNativeWorkspace();
  const { t, dateLocale } = useLocale();
  return (
    <div className={`native-table-scroll ${className}`}>
      <table>
        <thead>
          <tr>
            <th>{t("Task")}</th>
            <th>{t("Target application")}</th>
            <th>{t("Status")}</th>
            <th>{t("Created")}</th>
            <th>{t("Evidence")}</th>
          </tr>
        </thead>
        <tbody>
          {(records || tasks).map((task) => (
            <tr
              key={task.id}
              className={selected?.id === task.id ? "selected" : ""}
            >
              <td>
                <button onClick={() => setSelectedId(task.id)}>
                  {taskName(task)}
                </button>
                <small>#{task.id.slice(0, 8)}</small>
              </td>
              <td>
                {task.plan.kind === "open_application"
                  ? task.plan.application.name
                  : t("Computer")}
              </td>
              <td>
                <span className="native-status">{t(task.status)}</span>
              </td>
              <td>
                {new Date(task.created_at * 1000).toLocaleString(dateLocale)}
              </td>
              <td>{task.result?.steps.length || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!(records || tasks).length && (
        <p className="native-note">{t("No action evidence available yet.")}</p>
      )}
    </div>
  );
}
export function NativeExport() {
  const { selected } = useNativeWorkspace();
  const { t } = useLocale();
  return (
    <button
      className="native-export"
      disabled={!selected}
      onClick={() =>
        selected && downloadTaskJson(`inti-local-${selected.id}.json`, selected)
      }
    >
      <Download size={14} />
      {t("Export receipt")}
    </button>
  );
}
export function NativeStat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  icon?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <section>
      <header>
        {icon || <Activity size={15} />}
        <h2>{t(label)}</h2>
      </header>
      <strong>{value}</strong>
      <div className="native-stat-rule" />
      <p>{t(note || "Latest 100 task records.")}</p>
    </section>
  );
}
export function NativeDeviceMark() {
  return <Monitor size={25} aria-hidden="true" />;
}
