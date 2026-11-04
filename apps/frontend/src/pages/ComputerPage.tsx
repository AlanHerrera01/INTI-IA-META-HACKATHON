import { useLocale } from "../i18n/useLocale";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCheck,
  Clock3,
  Download,
  FileText,
  Globe,
  Link2,
  Monitor,
  Play,
  RefreshCw,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";
import { useOperator } from "../hooks/useOperator";
import { OperatorConnection } from "../components/OperatorConnection";
import { ComputerApplications } from "../components/ComputerApplications";
import { computerApi, type ComputerTask } from "../services/computerApi";
import { errorMessage } from "../services/api";
import { downloadTaskJson } from "../features/tasks/records";
import "../styles/computer.css";

export function ComputerPage({
  view = "control",
  initialTaskId = "",
  presentation = "full",
  onTaskPrepared,
}: {
  view?: "control" | "history" | "settings" | "planning" | "execution";
  initialTaskId?: string;
  presentation?: "full" | "compose" | "review" | "permissions";
  onTaskPrepared?: (task: ComputerTask) => void;
}) {
  const { token } = useOperator();
  return (
    <ComputerWorkspace
      key={`${token}:${view}:${initialTaskId}`}
      token={token}
      view={view}
      initialTaskId={initialTaskId}
      presentation={presentation}
      onTaskPrepared={onTaskPrepared}
    />
  );
}

function ComputerWorkspace({
  token,
  view,
  initialTaskId,
  presentation,
  onTaskPrepared,
}: {
  token: string;
  view: string;
  initialTaskId: string;
  presentation: "full" | "compose" | "review" | "permissions";
  onTaskPrepared?: (task: ComputerTask) => void;
}) {
  const { t, dateLocale } = useLocale();
  const query = useQuery({
    queryKey: ["computer-state", token],
    queryFn: () => computerApi.state(token),
    enabled: !!token,
    refetchInterval: 1500,
    retry: false,
  });
  const data = token && !query.isError ? query.data : undefined;
  const [deviceId, setDeviceId] = useState("");
  const [filename, setFilename] = useState("INTI-notes.txt");
  const [content, setContent] = useState(() =>
    t(
      "INTI AI — local computer task\n\nThis file was created by the paired Windows agent after approval.\nThe agent verifies the saved content, requests Notepad and opens the approved browser page.\n",
    ),
  );
  const [url, setUrl] = useState("https://example.com/");
  const [selectedId, setSelectedId] = useState(initialTaskId);
  const [review, setReview] = useState<ComputerTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pair, setPair] = useState<{
    code: string;
    expires_at: number;
    existing: number;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const taskPanel = useRef<HTMLElement>(null);
  const devices = data?.devices.filter((device) => !device.revoked) || [];
  const target = devices.find((device) => device.id === deviceId) || devices[0];
  const selected = selectedId
    ? data?.tasks.find((task) => task.id === selectedId)
    : data?.tasks[0];
  const online = (last: number) => Date.now() / 1000 - last < 30;
  const canConfirm =
    !!data &&
    !!review &&
    selected?.id === review.id &&
    selected.digest === review.digest &&
    selected.status === "DRAFT" &&
    devices.some(
      (device) => device.id === selected.device_id && online(device.last_seen),
    );
  const work = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await query.refetch();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const prepare = () =>
    target &&
    work(async () => {
      const task = await computerApi.prepare(token, {
        device_id: target.id,
        filename,
        content,
        url,
      });
      setSelectedId(task.id);
      onTaskPrepared?.(task);
    });
  const close = () => {
    dialog.current?.close();
    setReview(null);
  };
  return (
    <div
      className={`computer-workspace ${presentation !== "full" ? "native-embedded native-embedded-" + presentation : ""}`}
    >
      {presentation === "full" && (
        <>
          <header className="computer-heading">
            <div>
              <p className="computer-eyebrow">
                {t("INTI AI / LOCAL COMPUTER")}
              </p>
              <h1>
                {view === "planning"
                  ? t("AI Agent Studio")
                  : view === "execution"
                    ? t("Live Execution")
                    : view === "history"
                      ? t("Computer Task History")
                      : view === "settings"
                        ? t("Connected Computer & Permissions")
                        : t("Your computer. Your approved actions.")}
              </h1>
              <p>
                {t(
                  "A paired Windows agent creates a note, requests Notepad and opens an approved page. Every action belongs to the plan you review.",
                )}
              </p>
            </div>
            <span className="computer-tag">
              <ShieldCheck size={14} /> {t("APPROVAL REQUIRED")}
            </span>
          </header>
          <details className="computer-access" open={!token}>
            <summary>
              {token
                ? t("Operator access loaded · Manage connection")
                : t("Connect your operator capability")}
            </summary>
            <OperatorConnection />
          </details>
        </>
      )}
      {(error || query.isError) && (
        <p role="alert" className="computer-error">
          {t(error || errorMessage(query.error))}
          {query.isError &&
            t(" Current computer data and approvals are unavailable.")}
        </p>
      )}
      {presentation === "full" && (
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
            <Play size={19} />
            <div>
              <span>{t("Queued / running tasks")}</span>
              <strong>
                {data
                  ? data.tasks.filter((task) =>
                      ["QUEUED", "RUNNING"].includes(task.status),
                    ).length
                  : "—"}
              </strong>
            </div>
          </section>
          <section>
            <ShieldCheck size={19} />
            <div>
              <span>{t("Planning source")}</span>
              <strong>{t("Authored sample · 0 model calls")}</strong>
            </div>
          </section>
        </div>
      )}
      {presentation === "full" && ["control", "planning"].includes(view) && (
        <ComputerApplications
          token={token}
          devices={devices}
          targetId={target?.id || ""}
          onTarget={setDeviceId}
          onPrepared={async (task) => {
            setSelectedId(task.id);
            await query.refetch();
            requestAnimationFrame(() =>
              taskPanel.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              }),
            );
          }}
        />
      )}
      <div
        className={`computer-layout${view === "settings" ? " computer-settings-layout" : ""}`}
      >
        <div className="computer-main">
          {["full", "compose"].includes(presentation) &&
            ["control", "planning"].includes(view) && (
              <section className="computer-card">
                <header>
                  <FileText size={18} />
                  <h2>{t("Prepare a visible Windows task")}</h2>
                  <span className="computer-tag">
                    {t("REAL LOCAL ACTIONS")}
                  </span>
                </header>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void prepare();
                  }}
                >
                  <div className="computer-form-row">
                    <label>
                      {t("Computer")}
                      <select
                        aria-label={t("Target computer")}
                        value={target?.id || ""}
                        onChange={(event) => setDeviceId(event.target.value)}
                      >
                        <option value="" disabled>
                          {t("Pair a Windows agent first")}
                        </option>
                        {devices.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.name} ·{" "}
                            {t(online(device.last_seen) ? "online" : "offline")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("New text filename")}
                      <input
                        aria-label={t("New text filename")}
                        value={filename}
                        onChange={(event) => setFilename(event.target.value)}
                        maxLength={80}
                      />
                    </label>
                  </div>
                  <label>
                    {t("File contents")}
                    <textarea
                      aria-label={t("File contents")}
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      rows={6}
                      maxLength={16000}
                    />
                  </label>
                  <label>
                    {t("Page to open in your default browser")}
                    <input
                      aria-label={t("Browser page URL")}
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                    />
                  </label>
                  <p className="computer-note">
                    {t(
                      "A new task folder is created inside the agent's authorized folder. Existing files are not overwritten. This release uses a typed sample plan; arbitrary desktop tasks and model planning are not enabled.",
                    )}
                  </p>
                  <button
                    className="computer-primary"
                    disabled={
                      !token ||
                      !data ||
                      !target ||
                      !online(target.last_seen) ||
                      busy ||
                      !content ||
                      !url
                    }
                  >
                    {t("Prepare plan")}
                  </button>
                </form>
              </section>
            )}
          {["full", "review"].includes(presentation) &&
            selected &&
            view !== "settings" && (
              <section
                className="computer-card computer-task"
                aria-label={t("Selected computer task")}
                ref={taskPanel}
              >
                <header>
                  <Play size={18} />
                  <h2>{t("Reviewed plan & live action receipts")}</h2>
                  <span
                    className={`computer-tag computer-status-${selected.status.toLowerCase()}`}
                  >
                    {t(selected.status)}
                  </span>
                </header>
                <p className="computer-task-id">
                  {t("Task")} {selected.id}
                </p>
                <div className="computer-plan-target">
                  {selected.plan.kind === "open_application" ? (
                    <>
                      <span>{t("APPLICATION")}</span>
                      <strong>{selected.plan.application.name}</strong>
                      <code>{selected.plan.application.path}</code>
                      <span>{t("Executable identity")}</span>
                      <code>{selected.plan.application.identity}</code>
                    </>
                  ) : (
                    <>
                      <span>{t("NEW FILE")}</span>
                      <code>
                        {selected.plan.authorized_root}\{selected.id}\
                        {selected.plan.filename}
                      </code>
                      {selected.plan.kind !== "create_documents" && (
                        <span>{t("BROWSER TARGET")}</span>
                      )}
                      {selected.plan.kind !== "create_documents" && (
                        <code>{selected.plan.url}</code>
                      )}
                    </>
                  )}
                </div>
                <ol className="computer-steps">
                  {selected.steps.map((step, index) => {
                    const receipt = selected.result?.steps.find(
                      (item) => item.id === step.id,
                    );
                    const Icon =
                      step.id === "open_application"
                        ? Monitor
                        : [FileText, Monitor, Globe][index] || FileText;
                    return (
                      <li key={step.id}>
                        <span
                          className={`computer-step-icon ${receipt ? "computer-recorded" : ""}`}
                        >
                          <Icon size={18} />
                        </span>
                        <div>
                          <h3>{t(step.action)}</h3>
                          <p>
                            {receipt?.status === "VERIFIED_READBACK"
                              ? t(
                                  "Agent read the saved file and matched its contents.",
                                )
                              : receipt?.status === "LAUNCH_REQUESTED"
                                ? t(
                                    "Windows accepted an application launch request. Visual completion is not independently verified.",
                                  )
                                : receipt?.status === "VALIDATED"
                                  ? t(
                                      "Approved document fields and totals validated.",
                                    )
                                  : t("Waiting for approved execution.")}
                          </p>
                          {receipt?.sha256 && (
                            <code>SHA-256 {receipt.sha256}</code>
                          )}
                          {receipt?.path && <code>{receipt.path}</code>}
                        </div>
                        <span className="computer-step-status">
                          {t(receipt?.status || "PENDING")}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {selected.result?.error && (
                  <p role="alert" className="computer-error">
                    {t(selected.result.error)}
                  </p>
                )}
                <details>
                  <summary>
                    {t(
                      selected.plan.kind === "open_application"
                        ? "Exact application and manifest digest"
                        : "Exact file contents and manifest digest",
                    )}
                  </summary>
                  <pre>
                    {selected.plan.kind === "open_application"
                      ? selected.plan.application.path
                      : selected.plan.content}
                  </pre>
                  <code className="computer-digest">{selected.digest}</code>
                </details>
                <div className="computer-task-actions">
                  <button
                    className="computer-primary"
                    disabled={selected.status !== "DRAFT" || busy || !data}
                    onClick={() => {
                      setReview(
                        JSON.parse(JSON.stringify(selected)) as ComputerTask,
                      );
                      dialog.current?.showModal();
                    }}
                  >
                    <ShieldCheck size={14} /> {t("Review & execute")}
                  </button>
                  <button
                    disabled={
                      !data ||
                      busy ||
                      !["DRAFT", "QUEUED", "RUNNING"].includes(selected.status)
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "Cancel remaining actions? Files and windows already created are retained.",
                          ),
                        )
                      )
                        void work(() => computerApi.cancel(token, selected.id));
                    }}
                  >
                    {t("Cancel remaining actions")}
                  </button>
                  <button
                    onClick={() =>
                      downloadTaskJson(
                        `inti-computer-task-${selected.id}.json`,
                        selected,
                      )
                    }
                  >
                    <Download size={14} /> {t("Export receipt")}
                  </button>
                </div>
              </section>
            )}
          {presentation === "full" && view !== "settings" && (
            <section
              className="computer-card"
              aria-label={t("Recent computer tasks")}
            >
              <header>
                <Clock3 size={18} />
                <h2>{t("Recent computer tasks")}</h2>
                <button
                  disabled={!token || query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  <RefreshCw size={14} /> {t("Refresh")}
                </button>
              </header>
              {data?.tasks.length ? (
                <div className="computer-history">
                  {data.tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedId(task.id)}
                      aria-pressed={selected?.id === task.id}
                    >
                      <FileText size={16} />
                      <span>
                        {task.plan.kind === "open_application"
                          ? task.plan.application.name
                          : task.plan.filename}
                        <small>
                          {new Date(task.created_at * 1000).toLocaleString(
                            dateLocale,
                          )}{" "}
                          · {task.id.slice(0, 8)}
                        </small>
                      </span>
                      <strong>{t(task.status)}</strong>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="computer-empty">
                  {token
                    ? t(
                        "No computer tasks available. Pair an agent and prepare a plan.",
                      )
                    : t("Connect to inspect protected computer tasks.")}
                </p>
              )}
              <p className="computer-note">
                {t(
                  "Latest 100 task records. Receipts describe local agent actions; they do not certify arbitrary application outcomes.",
                )}
              </p>
            </section>
          )}
        </div>
        {["full", "permissions"].includes(presentation) && (
          <aside className="computer-sidebar">
            <section
              className="computer-card"
              aria-label={t("Paired Windows agents")}
            >
              <header>
                <Link2 size={18} />
                <h2>{t("Connect your Windows agent")}</h2>
              </header>
              <p>
                {t(
                  "Install and run the agent on the computer you authorize. It connects outward to INTI; it does not expose a remote-control port.",
                )}
              </p>
              <a
                className="computer-download"
                href="/downloads/inti-local-agent.zip"
                download
              >
                <Download size={15} /> {t("Download Windows agent")}
              </a>
              <ol className="computer-setup">
                <li>
                  {t("Extract the ZIP and run")}{" "}
                  <code>Start-INTI-Agent.ps1</code>{" "}
                  {t("with Python 3.12+ installed.")}
                </li>
                <li>
                  {t(
                    "Enter this server's backend URL and a one-time pairing code.",
                  )}
                </li>
                <li>
                  {t(
                    "Keep the agent running. Review the authorized folder before approving any task.",
                  )}
                </li>
              </ol>
              <button
                disabled={!token || !data || busy}
                onClick={() =>
                  void work(async () => {
                    const next = await computerApi.pairing(token);
                    setPair({ ...next, existing: devices.length });
                  })
                }
              >
                {t("Generate pairing code")}
              </button>
              {pair &&
                pair.existing >= devices.length &&
                pair.expires_at * 1000 > Date.now() && (
                  <div className="computer-pair-code">
                    <span>
                      {t("ONE USE · expires")}{" "}
                      {new Date(pair.expires_at * 1000).toLocaleTimeString(
                        dateLocale,
                      )}
                    </span>
                    <code>{pair.code}</code>
                    <p>
                      {t(
                        "Enter this code only in your local agent. It grants access to the device you pair.",
                      )}
                    </p>
                  </div>
                )}
              <div className="computer-devices">
                {devices.map((device) => (
                  <article key={device.id}>
                    <header>
                      <Monitor size={17} />
                      <h3>{device.name}</h3>
                      <span>
                        {t(online(device.last_seen) ? "ONLINE" : "OFFLINE")}
                      </span>
                    </header>
                    <p>{t("Authorized folder")}</p>
                    <code>{device.root}</code>
                    <button
                      disabled={busy || !data}
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "Revoke this agent and cancel its pending actions?",
                            ),
                          )
                        )
                          void work(() => computerApi.revoke(token, device.id));
                      }}
                    >
                      <Unplug size={12} /> {t("Revoke access")}
                    </button>
                  </article>
                ))}
              </div>
              {!devices.length && (
                <p className="computer-empty">
                  {t("No paired Windows agent available.")}
                </p>
              )}
            </section>
            <section className="computer-card computer-permissions">
              <header>
                <ShieldCheck size={18} />
                <h2>{t("Granted capabilities")}</h2>
              </header>
              <ul>
                <li>
                  <CheckCheck size={14} />{" "}
                  {t("Create a new .txt file in the authorized folder")}
                </li>
                <li>
                  <CheckCheck size={14} />{" "}
                  {t("Request Notepad for that exact file")}
                </li>
                <li>
                  <CheckCheck size={14} />{" "}
                  {t("Request an approved http(s) browser URL")}
                </li>
              </ul>
              <p>
                {t(
                  "Shell commands, deleting files, installing applications, screenshots and unrestricted mouse/keyboard control are outside this release.",
                )}
              </p>
              <p>
                {t(
                  "Cancellation stops remaining actions; it does not close existing windows or undo file creation.",
                )}
              </p>
            </section>
          </aside>
        )}
      </div>
      <dialog
        className="computer-approval"
        ref={dialog}
        onCancel={() => setReview(null)}
      >
        <header>
          <h2>{t("Approve these exact actions on your PC")}</h2>
          <button aria-label={t("Close approval")} onClick={close}>
            <X size={18} />
          </button>
        </header>
        {review && (
          <>
            {review.plan.kind === "create_documents" ? (
              <>
                <p>
                  {t(
                    "Five new document files will be created in a new task folder. No application will be opened and nothing will be sent externally.",
                  )}
                </p>
                <code>{review.plan.authorized_root}</code>
                <pre>{review.plan.content}</pre>
                <p>
                  {t(
                    "Outputs: Word quotation, Excel budget, PDF quotation, text summary and integrity manifest.",
                  )}
                </p>
              </>
            ) : review.plan.kind === "open_application" ? (
              <>
                <p>
                  {t(
                    "This exact application will be requested without command-line arguments. Actions inside it are not authorized by this plan.",
                  )}
                </p>
                <h3>{review.plan.application.name}</h3>
                <code>{review.plan.application.path}</code>
                <p className="computer-note">
                  {t("Executable identity")}: {review.plan.application.identity}
                </p>
              </>
            ) : (
              <>
                <p>
                  {t("A file will be created inside")}{" "}
                  <strong>{review.plan.authorized_root}</strong>
                  {t(
                    ", opened through Notepad, and this URL requested in your default browser:",
                  )}
                </p>
                <code>{review.plan.url}</code>
                <h3>{review.plan.filename}</h3>
                <pre>{review.plan.content}</pre>
              </>
            )}
            <p className="computer-note">
              {t("Review digest:")} {review.digest}
            </p>
            {!canConfirm && (
              <p role="alert">
                {t(
                  "The task, device or read state changed. Close and review the current plan.",
                )}
              </p>
            )}
            <div>
              <button onClick={close}>{t("Back")}</button>
              <button
                className="computer-primary"
                disabled={!canConfirm || busy}
                onClick={() => {
                  const snapshot = review;
                  void work(async () => {
                    await computerApi.approve(
                      token,
                      snapshot.id,
                      snapshot.digest,
                    );
                    close();
                  });
                }}
              >
                {t("Approve & run on this computer")}
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
