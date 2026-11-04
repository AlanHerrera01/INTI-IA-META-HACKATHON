import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Monitor,
  ShieldCheck,
  FileCheck2,
  Wrench,
  Cpu,
  Eye,
} from "lucide-react";
import { OperatorConnection } from "../components/OperatorConnection";
import { useOperator } from "../hooks/useOperator";
import { useLocale } from "../i18n/useLocale";
import { useModel } from "../hooks/useSystem";
import { computerApi, type ComputerTask } from "../services/computerApi";
import { errorMessage } from "../services/api";
import {
  localMetrics,
  recoveryCandidate,
  taskName,
} from "../features/computer/workflow";
import { downloadTaskJson } from "../features/tasks/records";
import "../styles/computer.css";
import "../styles/local-workflow.css";

const titles = {
  overview: "Overview",
  observations: "Visual Observations",
  hardware: "Hardware & IT Inventory",
  recovery: "Recovery Center",
  verification: "Verification Lab",
  analytics: "Analytics & Benchmarks",
  activity: "Activity Logs",
  models: "AI Models",
};
export function LocalWorkflowPage({ view }: { view: keyof typeof titles }) {
  const { token } = useOperator();
  return <LocalWorkspace key={`${token}:${view}`} view={view} token={token} />;
}
function LocalWorkspace({
  view,
  token,
}: {
  view: keyof typeof titles;
  token: string;
}) {
  const { t, dateLocale } = useLocale();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["computer-state", token],
    queryFn: () => computerApi.state(token),
    enabled: !!token,
    refetchInterval: 2000,
    retry: false,
  });
  const data = token && !query.isError ? query.data : undefined;
  const tasks = data?.tasks || [];
  const devices = data?.devices.filter((device) => !device.revoked) || [];
  const latestDevice = devices[0];
  const model = useModel();
  const catalogQuery = useQuery({
    queryKey: ["computer-applications", token, latestDevice?.id],
    queryFn: () => computerApi.applications(token, latestDevice!.id),
    enabled: !!token && !!latestDevice,
    refetchInterval: 10000,
    retry: false,
  });
  const catalog = !catalogQuery.isError && data ? catalogQuery.data : undefined;
  const metrics = localMetrics(tasks);
  const online = (seen: number) => Date.now() / 1000 - seen < 30;
  const receipts = tasks.filter((task) => !!task.result?.steps.length);
  const recover = async (task: ComputerTask) => {
    if (
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
      let prepared: ComputerTask;
      if (task.plan.kind === "open_application") {
        const current = await computerApi.applications(token, task.device_id);
        const app = current.applications.find(
          (app) =>
            app.id === task.plan.application?.id &&
            app.allowed &&
            app.identity === task.plan.application?.identity,
        );
        if (!app)
          throw new Error(
            "Application is not authorized or its catalog is stale",
          );
        prepared = await computerApi.prepareApplication(
          token,
          task.device_id,
          app,
        );
      } else {
        prepared = await computerApi.prepare(token, {
          device_id: task.device_id,
          filename: task.plan.filename,
          content: task.plan.content,
          url: task.plan.url,
        });
      }
      await query.refetch();
      navigate(`/planning?task=${prepared.id}`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="computer-workspace local-workflow">
      <header className="computer-heading">
        <div>
          <p className="computer-eyebrow">{t("INTI AI / LOCAL COMPUTER")}</p>
          <h1>{t(titles[view])}</h1>
          <p>
            {t(
              "Observe your connected computer, review a plan, execute approved actions, inspect evidence and recover safely.",
            )}
          </p>
        </div>
        <Link className="computer-primary local-link" to="/planning">
          {t("New Task")} <ArrowRight size={15} />
        </Link>
      </header>
      <details className="computer-access" open={!token}>
        <summary>
          {t(
            token
              ? "Operator access loaded · Manage connection"
              : "Connect your operator capability",
          )}
        </summary>
        <OperatorConnection />
      </details>
      {(query.isError || error) && (
        <p role="alert" className="computer-error">
          {t(error || errorMessage(query.error))}
        </p>
      )}
      <div className="computer-metrics">
        <section>
          <Monitor size={19} />
          <div>
            <span>{t("Paired computers online")}</span>
            <strong>
              {data
                ? devices.filter((device) => online(device.last_seen)).length
                : "—"}
            </strong>
          </div>
        </section>
        <section>
          <Activity size={19} />
          <div>
            <span>{t("Queued / running tasks")}</span>
            <strong>{data ? metrics.active : "—"}</strong>
          </div>
        </section>
        <section>
          <ShieldCheck size={19} />
          <div>
            <span>{t("Evidence source")}</span>
            <strong>{t("Paired local agent")}</strong>
          </div>
        </section>
      </div>
      {!token && (
        <p className="computer-empty">
          {t("Connect to inspect protected computer tasks.")}
        </p>
      )}
      {view === "overview" && (
        <>
          <section className="computer-card">
            <header>
              <Activity size={19} />
              <h2>{t("Local mission lifecycle")}</h2>
            </header>
            <div className="local-lifecycle">
              {[
                ["Visual Observations", "/observations"],
                ["AI Agent Studio", "/planning"],
                ["Live Execution", "/execution"],
                ["Recovery Center", "/recovery"],
                ["Verification Lab", "/verification"],
              ].map(([label, to]) => (
                <Link key={to} to={to}>
                  {t(label)}
                  <ArrowRight size={14} />
                </Link>
              ))}
            </div>
            <p className="computer-note">
              {t(
                "All records below belong to your paired computer. Application launches and file checks are reported separately.",
              )}
            </p>
          </section>
          <section className="computer-card">
            <header>
              <Monitor size={19} />
              <h2>{t("Connected computers")}</h2>
            </header>
            <div className="local-device-grid">
              {devices.map((device) => (
                <article key={device.id}>
                  <h3>{device.name}</h3>
                  <p>{t(online(device.last_seen) ? "ONLINE" : "OFFLINE")}</p>
                  <code>{device.root}</code>
                  <Link to="/computer">
                    {t("Applications on this computer")}
                  </Link>
                </article>
              ))}
            </div>
          </section>
          <TaskTable tasks={tasks.slice(0, 8)} />
        </>
      )}
      {view === "observations" && (
        <>
          <section className="computer-card">
            <header>
              <Eye size={19} />
              <h2>{t("Local observation sources")}</h2>
            </header>
            <p>
              {t(
                "The local agent reports its connected device, authorized folder and detected application catalog. Desktop screenshots and visual interpretation are not yet implemented for this agent.",
              )}
            </p>
            <p className="computer-note">
              {t(
                "No desktop screenshot has been captured. Application icons are not screen observations.",
              )}
            </p>
            <Link to="/computer">{t("Applications on this computer")}</Link>
          </section>
          <section className="computer-card">
            <header>
              <Monitor size={19} />
              <h2>{t("Detected application catalog")}</h2>
            </header>
            <p>
              {catalog ? catalog.applications.length : "—"}{" "}
              {t("compatible desktop applications")}
            </p>
            <p>
              {t("Last scan")}:{" "}
              {catalog?.scanned_at
                ? new Date(catalog.scanned_at * 1000).toLocaleString(dateLocale)
                : "—"}
            </p>
            <p className="computer-note">
              {t(
                "This is agent-reported context, not a visual screenshot or model inference.",
              )}
            </p>
          </section>
        </>
      )}
      {view === "hardware" && (
        <section className="computer-card">
          <header>
            <Monitor size={19} />
            <h2>{t("Connected computers")}</h2>
          </header>
          <div className="local-device-grid">
            {devices.map((device) => (
              <article key={device.id}>
                <h3>{device.name}</h3>
                <dl>
                  <dt>{t("Platform")}</dt>
                  <dd>{device.platform}</dd>
                  <dt>{t("Last heartbeat")}</dt>
                  <dd>
                    {new Date(device.last_seen * 1000).toLocaleString(
                      dateLocale,
                    )}
                  </dd>
                  <dt>{t("Authorized folder")}</dt>
                  <dd>
                    <code>{device.root}</code>
                  </dd>
                </dl>
                <Link to="/computer/permissions">
                  {t("Computers & Permissions")}
                </Link>
              </article>
            ))}
          </div>
          <p className="computer-note">
            {t(
              "CPU, RAM and disk specifications are not reported by this agent yet. No demo inventory is shown.",
            )}
          </p>
        </section>
      )}
      {view === "recovery" && (
        <section className="computer-card">
          <header>
            <Wrench size={19} />
            <h2>{t("Tasks requiring attention")}</h2>
          </header>
          <p className="computer-note">
            {t(
              "Interrupted actions are never replayed automatically. Inspect the recorded steps and existing files before preparing a new reviewed draft.",
            )}
          </p>
          {tasks.filter(recoveryCandidate).map((task) => (
            <article className="local-record" key={task.id}>
              <h3>{taskName(task)}</h3>
              <span className="computer-tag">{t(task.status)}</span>
              <p>{t(task.result?.error || "No error receipt available.")}</p>
              <p>
                {task.result?.steps.length || 0} {t("recorded action receipts")}
              </p>
              <code>{task.id}</code>
              <button
                disabled={
                  busy ||
                  !data ||
                  !devices.some(
                    (device) =>
                      device.id === task.device_id && online(device.last_seen),
                  )
                }
                onClick={() => void recover(task)}
              >
                {t("Prepare a new reviewed draft")}
              </button>
              <button
                onClick={() =>
                  downloadTaskJson(`inti-recovery-${task.id}.json`, task)
                }
              >
                {t("Export receipt")}
              </button>
            </article>
          ))}
          {!tasks.some(recoveryCandidate) && (
            <p className="computer-empty">
              {t(
                "No failed, interrupted or canceled tasks in the loaded history.",
              )}
            </p>
          )}
        </section>
      )}
      {view === "verification" && (
        <section className="computer-card">
          <header>
            <FileCheck2 size={19} />
            <h2>{t("Recorded verification evidence")}</h2>
          </header>
          <p className="computer-note">
            {t(
              "File readback checks the saved contents. An application launch receipt only records a launch request. Independent desktop visual verification is not yet available.",
            )}
          </p>
          {receipts.map((task) => (
            <article className="local-record" key={task.id}>
              <h3>{taskName(task)}</h3>
              <code>{task.id}</code>
              {task.result?.steps.map((step) => (
                <div className="local-evidence" key={step.id}>
                  <strong>{t(step.status)}</strong>
                  {step.path && <code>{step.path}</code>}
                  {step.sha256 && <code>SHA-256 {step.sha256}</code>}
                  {step.url && <code>{step.url}</code>}
                  {step.pid && <span>PID {step.pid}</span>}
                </div>
              ))}
              <button
                onClick={() =>
                  downloadTaskJson(`inti-evidence-${task.id}.json`, task)
                }
              >
                {t("Export receipt")}
              </button>
            </article>
          ))}
          {!receipts.length && (
            <p className="computer-empty">
              {t("No action evidence available yet.")}
            </p>
          )}
        </section>
      )}
      {view === "analytics" && (
        <>
          <section className="computer-card">
            <header>
              <Activity size={19} />
              <h2>{t("Measured local task history")}</h2>
            </header>
            <div className="local-stat-grid">
              {[
                ["Loaded tasks", metrics.total],
                ["COMPLETED", metrics.completed],
                ["Tasks requiring attention", metrics.attention],
                ["File readbacks", metrics.fileReadbacks],
                ["Application launch requests", metrics.launches],
              ].map(([label, value]) => (
                <article key={label}>
                  <span>{t(String(label))}</span>
                  <strong>{data ? value : "—"}</strong>
                </article>
              ))}
            </div>
            <p className="computer-note">
              {t(
                "Metrics use the latest 100 local task records. Completed tasks are not automatically independent verification successes. No live-model benchmark is claimed.",
              )}
            </p>
          </section>
          <TaskTable tasks={tasks} />
        </>
      )}
      {view === "activity" && (
        <section className="computer-card">
          <header>
            <Activity size={19} />
            <h2>{t("Local task activity")}</h2>
          </header>
          <p className="computer-note">
            {t(
              "Creation and latest update times come from the task ledger. Individual action timestamps are not available.",
            )}
          </p>
          {tasks.map((task) => (
            <article className="local-record" key={task.id}>
              <h3>{taskName(task)}</h3>
              <span className="computer-tag">{t(task.status)}</span>
              <dl>
                <dt>{t("Created")}</dt>
                <dd>
                  {new Date(task.created_at * 1000).toLocaleString(dateLocale)}
                </dd>
                <dt>{t("Latest update")}</dt>
                <dd>
                  {new Date(task.updated_at * 1000).toLocaleString(dateLocale)}
                </dd>
              </dl>
              <code>{task.id}</code>
              <p>
                {task.result?.steps.map((step) => t(step.status)).join(" · ") ||
                  t("Waiting for approved execution.")}
              </p>
            </article>
          ))}
          {!tasks.length && (
            <p className="computer-empty">
              {t("No action evidence available yet.")}
            </p>
          )}
        </section>
      )}
      {view === "models" && (
        <section className="computer-card">
          <header>
            <Cpu size={19} />
            <h2>{t("AI Models")}</h2>
          </header>
          <p>{model.data?.model || "—"}</p>
          <span className="computer-tag">
            {t(model.data?.configured ? "Unverified" : "Not configured")}
          </span>
          <p>
            {t(
              "Current local plans are explicitly authored. Live-model calls remain disabled; model planning and desktop visual reasoning have not been connected to this agent yet.",
            )}
          </p>
          <Link to="/planning">{t("AI Agent Studio")}</Link>
        </section>
      )}
      <div className="local-workflow-footer">
        <Link to="/planning">{t("AI Agent Studio")}</Link>
        <Link to="/execution">{t("Live Execution")}</Link>
        <Link to="/computer/permissions">{t("Computers & Permissions")}</Link>
      </div>
    </div>
  );
}
function TaskTable({ tasks }: { tasks: ComputerTask[] }) {
  const { t, dateLocale } = useLocale();
  return (
    <section className="computer-card">
      <header>
        <Activity size={19} />
        <h2>{t("Recent computer tasks")}</h2>
      </header>
      <div className="local-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Task")}</th>
              <th>{t("Status")}</th>
              <th>{t("Created")}</th>
              <th>{t("Evidence")}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <Link to={`/tasks?task=${task.id}`}>{taskName(task)}</Link>
                  <small>{task.id}</small>
                </td>
                <td>{t(task.status)}</td>
                <td>
                  {new Date(task.created_at * 1000).toLocaleString(dateLocale)}
                </td>
                <td>{task.result?.steps.length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!tasks.length && (
        <p className="computer-empty">
          {t("No action evidence available yet.")}
        </p>
      )}
    </section>
  );
}
