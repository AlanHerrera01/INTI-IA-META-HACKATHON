import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Boxes,
  CheckCircle2,
  Download,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { OperatorConnection } from "../components/OperatorConnection";
import { useOperator } from "../hooks/useOperator";
import { missionApi } from "../services/missionApi";
import { errorMessage } from "../services/api";
import { TaskInspector } from "../features/tasks/TaskInspector";
import {
  downloadTaskJson,
  recoveredTask,
  taskElapsed,
  taskMatches,
  type TaskRecord,
} from "../features/tasks/records";
import "../styles/mission.css";
import "../styles/observations.css";
import "../styles/task-manager.css";

export function TaskManager() {
  const { token } = useOperator();
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [preparation, setPreparation] = useState("");
  const [tab, setTab] = useState("all");
  const [hours, setHours] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const history = useQuery({
    queryKey: ["mission-history", token, offset],
    queryFn: () => missionApi.list(token, offset),
    enabled: !!token,
    refetchInterval: 5000,
  });
  const missions = token && !history.isError ? (history.data?.items ?? []) : [];
  const details = useQueries({
    queries: missions.map((mission) => ({
      queryKey: ["mission", mission.id, token],
      queryFn: () => missionApi.get(mission.id, token),
      enabled: !!token,
      refetchInterval: 5000,
      retry: false,
    })),
  });
  const records: TaskRecord[] = missions.map((mission, index) => {
    const query = details[index];
    const mismatch = query.data && query.data.mission.id !== mission.id;
    return {
      mission,
      detail: !query.isError && !mismatch ? query.data : undefined,
      error: query.error
        ? errorMessage(query.error)
        : mismatch
          ? "The returned task detail does not match this mission."
          : undefined,
    };
  });
  const known = records.filter((record) => !!record.detail);
  const counts = {
    all: records.length,
    running: known.filter(
      (record) => record.detail?.execution?.session.status === "RUNNING",
    ).length,
    completed: known.filter(
      (record) => record.detail?.execution?.session.status === "COMPLETED",
    ).length,
    recovered: known.filter((record) => recoveredTask(record.detail)).length,
  };
  const verified = known.filter(
    (record) =>
      record.detail?.verification_report?.effective_verdict ===
      "VERIFIED_SUCCESS",
  ).length;
  const visible = records.filter((record) =>
    taskMatches(record, tab, search, preparation, hours, Date.now()),
  );
  const focused =
    visible.find((record) => record.mission.id === selectedId) ?? visible[0];
  const focusedIndex = focused
    ? missions.findIndex((mission) => mission.id === focused.mission.id)
    : -1;
  const focusedLoading = focusedIndex >= 0 && details[focusedIndex]?.isPending;
  const pending = details.some((query) => query.isPending);
  const canCount = !!token && !!history.data && !history.error;
  const busy = history.isFetching || details.some((query) => query.isFetching);
  const refresh = () => {
    void history.refetch();
    details.forEach((query) => {
      void query.refetch();
    });
  };
  const exportVisible = () =>
    downloadTaskJson("inti-task-ledger-page.json", {
      scope: "Filtered records on the loaded page only",
      offset,
      total_stored: history.data?.total,
      records: visible.map((record) => ({
        mission: record.mission,
        execution_status: record.detail?.execution?.session.status ?? null,
        effective_verdict:
          record.detail?.verification_report?.effective_verdict ?? null,
        detail_available: !!record.detail,
      })),
    });
  return (
    <div className="task-workspace task-manager-desktop">
      <header className="task-manager-heading">
        <div>
          <p className="task-manager-eyebrow">
            AUTONOMOUS DISPATCH{" "}
            <span>MISSION CONTROL / RECORDED WORKFLOWS</span>
          </p>
          <h1>Task Manager</h1>
          <p>
            Track each objective, inspect its execution and follow the evidence
            behind its outcome.
          </p>
        </div>
        <div className="task-manager-metrics">
          <section aria-label="Stored tasks">
            <Boxes size={17} />
            <div>
              <span>STORED TASKS</span>
              <strong>
                {history.error ? "Unavailable" : (history.data?.total ?? "—")}
              </strong>
            </div>
          </section>
          <section aria-label="Verified tasks on this page">
            <CheckCircle2 size={17} />
            <div>
              <span>VERIFIED / PAGE</span>
              <strong>
                {!canCount ? "—" : pending ? "Loading…" : verified}
              </strong>
            </div>
          </section>
          <section aria-label="Recovered tasks on this page">
            <Wrench size={17} />
            <div>
              <span>RECOVERED / PAGE</span>
              <strong>
                {!canCount ? "—" : pending ? "Loading…" : counts.recovered}
              </strong>
            </div>
          </section>
        </div>
      </header>
      <details className="task-operator" open={!token}>
        <summary>
          {token
            ? "Operator connected · manage connection"
            : "Connect your local operator"}
        </summary>
        <OperatorConnection />
      </details>
      {history.error && (
        <p role="alert" className="mission-error">
          {errorMessage(history.error)}
        </p>
      )}
      <div className="task-manager-toolbar">
        <div
          className="task-manager-tabs"
          role="group"
          aria-label="Task lifecycle filters"
        >
          {[
            ["all", "All Tasks"],
            ["running", "Running"],
            ["completed", "Completed"],
            ["recovered", "Recovered"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              title={
                value === "recovered"
                  ? "Tasks with a recorded RECOVERED session on this page"
                  : "Filter the loaded page only"
              }
            >
              {value === "recovered" && <Wrench size={12} />}
              {label}
              <span>{counts[value as keyof typeof counts]}</span>
            </button>
          ))}
        </div>
        <label className="task-manager-search">
          <Search size={16} />
          <input
            aria-label="Search missions on this page"
            placeholder="Filter by task ID, objective or app…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="task-manager-time">
          <span className="sr-only">Creation window on this page</span>
          <select
            aria-label="Creation window on this page"
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
          >
            <option value={0}>All recorded dates</option>
            <option value={24}>Last 24 Hours</option>
            <option value={168}>Last 7 Days</option>
          </select>
        </label>
        <Link className="button primary" to="/missions/new?compose=1">
          <Plus size={15} />
          New Task
        </Link>
      </div>
      <div className="task-manager-layout">
        <section className="task-manager-ledger" aria-label="Task ledger">
          <header className="task-ledger-heading">
            <h2>
              <ListChecks size={17} />
              Active Task Ledger <span>LOADED PAGE</span>
            </h2>
            <div>
              <button
                aria-label="Refresh mission history"
                disabled={!token || busy}
                onClick={refresh}
              >
                <RefreshCw size={15} />
              </button>
              <button
                aria-label="Export visible tasks as JSON"
                disabled={!visible.length}
                onClick={exportVisible}
              >
                <Download size={15} />
              </button>
            </div>
          </header>
          <div className="task-ledger-scope">
            <p>
              Search and status filters apply to this page of up to 20 missions.
              Preparation, execution and independent verification are separate.
            </p>
            <label>
              Preparation status
              <select
                aria-label="Preparation status"
                value={preparation}
                onChange={(event) => setPreparation(event.target.value)}
              >
                <option value="">All preparation states</option>
                <option value="CREATED">Created</option>
                <option value="PREPARING">Preparing</option>
                <option value="PLAN_READY">Plan ready</option>
                <option value="FAILED">Failed preparation</option>
              </select>
            </label>
          </div>
          {records.length > 0 && (
            <p className="task-detail-coverage">
              {known.length} of {records.length} task details available ·
              lifecycle counts describe this page
              {pending ? " · loading details…" : ""}
              {records.some((record) => record.error)
                ? " · some details unavailable"
                : ""}
            </p>
          )}
          {!token ? (
            <div className="task-empty">
              <ListChecks size={32} />
              <h3>Your mission history</h3>
              <p>Connect with your operator capability to load saved tasks.</p>
            </div>
          ) : history.isPending ? (
            <p role="status" className="task-empty">
              Loading mission history…
            </p>
          ) : history.isError ? (
            <p className="task-empty">
              Mission history is unavailable. Refresh to retry.
            </p>
          ) : !visible.length ? (
            <p role="status" className="task-empty">
              {history.data?.total
                ? "No missions match these filters on this page."
                : "No missions yet. Create your first task to begin."}
            </p>
          ) : (
            <div className="task-table-scroll">
              <table className="task-table">
                <caption className="sr-only">
                  Saved missions with separate preparation and execution states
                </caption>
                <colgroup>
                  <col className="task-col-id" />
                  <col className="task-col-objective" />
                  <col className="task-col-app" />
                  <col className="task-col-source" />
                  <col className="task-col-execution" />
                  <col className="task-col-duration" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Task ID</th>
                    <th scope="col">Objective / name</th>
                    <th scope="col">Target app</th>
                    <th scope="col">Source</th>
                    <th scope="col">Execution</th>
                    <th scope="col">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((record) => {
                    const mission = record.mission;
                    const elapsed = taskElapsed(record.detail);
                    const state = record.detail?.execution?.session.status;
                    return (
                      <tr
                        key={mission.id}
                        data-mission-id={mission.id}
                        className={
                          focused?.mission.id === mission.id
                            ? "selected-task"
                            : ""
                        }
                      >
                        <td>
                          <button
                            className="task-select-id"
                            aria-label={`Inspect mission ${mission.id}`}
                            aria-pressed={focused?.mission.id === mission.id}
                            onClick={() => setSelectedId(mission.id)}
                          >
                            <i
                              className={`task-row-marker state-${(state || mission.status).toLowerCase()}`}
                            />
                            #{mission.id.slice(0, 8)}
                          </button>
                        </td>
                        <td>
                          <Link
                            className="task-objective"
                            title={mission.objective}
                            to={`/missions/${mission.id}`}
                          >
                            {mission.objective}
                          </Link>
                          <span
                            className={`task-preparation-tag state-${mission.status.toLowerCase()}`}
                          >
                            {mission.status.replaceAll("_", " ")}
                          </span>
                          <small className="task-created-at">
                            {new Date(mission.created_at).toLocaleString()}
                          </small>
                        </td>
                        <td>
                          <span className="task-target-app">
                            <Boxes size={15} />
                            {mission.target_application || "Unavailable"}
                          </span>
                        </td>
                        <td>
                          <span className="task-row-source">
                            {mission.mode === "meta"
                              ? "Meta pipeline"
                              : "Authored"}
                          </span>
                          <small>
                            {mission.mode === "authored_demo"
                              ? "No model"
                              : record.detail?.plan?.model_usage
                                  .map((item) => item.model)
                                  .join(", ") || "No usage recorded"}
                          </small>
                        </td>
                        <td>
                          <span
                            className={`task-execution-state state-${state?.toLowerCase() || "pending"}`}
                          >
                            {record.error
                              ? "Unavailable"
                              : state?.replaceAll("_", " ") ||
                                (record.detail ? "Not started" : "Loading…")}
                          </span>
                        </td>
                        <td className="task-row-duration">
                          {elapsed === null ? "—" : `${elapsed.toFixed(2)}s`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <footer className="task-pagination">
            <span>
              {history.data && !history.error
                ? `${visible.length} visible of ${missions.length} loaded · ${history.data.total} stored tasks`
                : "No history loaded"}
            </span>
            <div>
              <button
                className="button secondary"
                disabled={!token || offset === 0 || history.isFetching}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                Previous
              </button>
              <span>
                Page {Math.floor(offset / 20) + 1}
                {history.data
                  ? ` of ${Math.max(1, Math.ceil(history.data.total / 20))}`
                  : ""}
              </span>
              <button
                className="button secondary"
                disabled={
                  !token ||
                  !history.data ||
                  offset + 20 >= history.data.total ||
                  history.isFetching
                }
                onClick={() => setOffset(offset + 20)}
              >
                Next
              </button>
            </div>
          </footer>
        </section>
        <TaskInspector
          key={(focused?.mission.id || "none") + token}
          record={focused}
          loading={!!focusedLoading}
          token={token}
        />
      </div>
      <p className="task-manager-footer">
        Inspection and exports use saved records. Approvals and execution remain
        in the mission and Live Execution workspaces.
      </p>
    </div>
  );
}
