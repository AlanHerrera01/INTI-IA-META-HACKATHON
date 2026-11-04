import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Braces,
  CheckCheck,
  Copy,
  Download,
  FileClock,
  FilterX,
  Layers3,
  Pause,
  Play,
  RefreshCw,
  ScanLine,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import { OperatorConnection } from "../components/OperatorConnection";
import { useOperator } from "../hooks/useOperator";
import { missionApi } from "../services/missionApi";
import { errorMessage } from "../services/api";
import { downloadTaskJson } from "../features/tasks/records";
import {
  activityCsv,
  activityKey,
  activitySources,
  eventMetadata,
  filterActivity,
  recentActivity,
  type ActivityFilters,
} from "../features/activity/records";
import "../styles/activity.css";

const emptyFilters: ActivityFilters = {
  search: "",
  source: "",
  type: "",
  period: "all",
};
const timestamp = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Timestamp unavailable";

export function ActivityPage() {
  const { token } = useOperator();
  return <ActivityWorkspace key={token} token={token} />;
}

function ActivityWorkspace({ token }: { token: string }) {
  const [filters, setFilters] = useState<ActivityFilters>(emptyFilters);
  const [page, setPage] = useState(0);
  const [chosen, setChosen] = useState("");
  const [compact, setCompact] = useState(false);
  const [polling, setPolling] = useState(true);
  const [copied, setCopied] = useState<{ value: string; ok: boolean } | null>(
    null,
  );
  // Separate from the shell's overview polling so this view can pause independently.
  const query = useQuery({
    queryKey: ["activity-window", token],
    queryFn: () => missionApi.overview(token),
    enabled: !!token,
    refetchInterval: polling ? 5000 : false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: polling,
    retry: false,
  });
  const loaded = !!token && query.isSuccess && !query.isError;
  const events = loaded ? recentActivity(query.data.recent_events) : [];
  const filtered = filterActivity(events, filters);
  const types = [...new Set(events.map((event) => event.event_type))].sort();
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * 6, currentPage * 6 + 6);
  const selected =
    visible.find((event) => activityKey(event) === chosen) || visible[0];
  const origin =
    selected && activitySources.find((source) => source.id === selected.source);
  const selectedJson = selected
    ? JSON.stringify(eventMetadata(selected), null, 2)
    : "";
  const update = (next: Partial<ActivityFilters>) => {
    setFilters((old) => ({ ...old, ...next }));
    setPage(0);
    setChosen("");
  };
  const reset = () => {
    setFilters(emptyFilters);
    setPage(0);
    setChosen("");
  };
  const exportJson = () => {
    if (!loaded || !filtered.length || query.isFetching) return;
    downloadTaskJson("inti-activity-window.json", {
      scope: "filtered_recent_window",
      snapshot_read_at: new Date(query.dataUpdatedAt).toISOString(),
      loaded_event_count: events.length,
      exported_event_count: filtered.length,
      filters: {
        source: filters.source || "all",
        event_type: filters.type || "all",
        period: filters.period,
        text_search_applied: !!filters.search.trim(),
      },
      events: filtered.map(eventMetadata),
    });
  };
  const exportCsv = () => {
    if (!loaded || !filtered.length || query.isFetching) return;
    const url = URL.createObjectURL(
      new Blob([activityCsv(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "inti-activity-filtered-window.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    if (!selectedJson) return;
    try {
      await navigator.clipboard.writeText(selectedJson);
      setCopied({ value: selectedJson, ok: true });
    } catch {
      setCopied({ value: selectedJson, ok: false });
    }
  };
  const metrics = [
    { label: "Loaded events", count: events.length, icon: FileClock },
    {
      label: "Execution events",
      count: events.filter((event) => event.source === "execution").length,
      icon: Terminal,
    },
    {
      label: "Recovery events",
      count: events.filter((event) => event.source === "recovery").length,
      icon: Wrench,
    },
    {
      label: "Verification events",
      count: events.filter((event) => event.source === "verification").length,
      icon: CheckCheck,
    },
    {
      label: "Planning events",
      count: events.filter((event) => event.source === "planning").length,
      icon: Layers3,
    },
  ];
  return (
    <div className="activity-workspace">
      <header className="activity-heading">
        <div>
          <p className="activity-eyebrow">
            <span>PERSISTED SYSTEM EVENTS</span> RECENT-WINDOW INSPECTION
          </p>
          <h1>System & Agent Activity Logs</h1>
          <p>
            Inspect recorded planning, execution, recovery and verification
            events with their source and timestamp.
          </p>
        </div>
        <div className="activity-heading-actions">
          <button disabled={!token} onClick={() => setPolling(!polling)}>
            {polling ? <Pause size={14} /> : <Play size={14} />}
            {polling ? "Pause auto-refresh" : "Resume auto-refresh"}
          </button>
          <div>
            <button
              disabled={!loaded || !filtered.length || query.isFetching}
              onClick={exportJson}
            >
              <Download size={14} /> Export JSON
            </button>
            <button
              disabled={!loaded || !filtered.length || query.isFetching}
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>
      <details className="activity-access" open={!token}>
        <summary>
          {token
            ? "Operator access loaded · Manage connection"
            : "Connect to protected activity"}
        </summary>
        <OperatorConnection />
      </details>
      {query.isError && (
        <p role="alert" className="activity-error">
          {errorMessage(query.error)} Activity is unavailable; previous events
          and exports are hidden.
        </p>
      )}
      <div className="activity-metrics">
        {metrics.map(({ label, count, icon: Icon }, index) => (
          <section
            aria-label={`${label} in loaded window`}
            className={`activity-metric-${index}`}
            key={label}
          >
            <div>
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>{loaded ? count : "—"}</strong>
            <small>In the loaded recent-event window</small>
            <div className="activity-metric-rule" />
          </section>
        ))}
      </div>
      <div className="activity-filters">
        <label>
          <Search size={15} />
          <input
            aria-label="Search activity events"
            value={filters.search}
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Search event ID, type or source…"
          />
        </label>
        <label>
          Event source
          <select
            aria-label="Event source"
            value={filters.source}
            onChange={(event) => update({ source: event.target.value })}
          >
            <option value="">All sources</option>
            {activitySources.map((source) => (
              <option value={source.id} key={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event type
          <select
            aria-label="Event type"
            value={filters.type}
            onChange={(event) => update({ type: event.target.value })}
          >
            <option value="">All types</option>
            {types.map((type) => (
              <option value={type} key={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Time window
          <select
            aria-label="Event time window"
            value={filters.period}
            onChange={(event) =>
              update({
                period: event.target.value as ActivityFilters["period"],
              })
            }
          >
            <option value="all">All loaded dates</option>
            <option value="24h">Past 24 hours</option>
            <option value="7d">Past 7 days</option>
          </select>
        </label>
      </div>
      <p className="activity-scope">
        The backend provides a bounded recent-event window. This is not the
        complete historical audit ledger. Filters apply to loaded events; open
        the source workspace for full records and evidence. Counts describe
        source-stream entries; an event ID may appear in more than one stream.
      </p>
      <div className="activity-layout">
        <section
          className={`activity-feed ${compact ? "activity-compact" : ""}`}
          aria-label="Recent persisted events"
        >
          <header>
            <div>
              <span className="activity-feed-dot" />
              <strong>
                {visible.length} DISPLAYED / {filtered.length} FILTERED /{" "}
                {events.length} LOADED
              </strong>
            </div>
            <div>
              <button onClick={reset}>
                <FilterX size={13} /> Reset
              </button>
              <button
                aria-pressed={compact}
                onClick={() => setCompact(!compact)}
              >
                Compact view
              </button>
              <button
                disabled={!token || query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
          </header>
          {!token ? (
            <div className="activity-empty">
              <Terminal size={29} />
              <h2>Connect to inspect persisted activity</h2>
              <p>
                Your operator capability is required for this recent-event
                window.
              </p>
            </div>
          ) : query.isPending ? (
            <p role="status" className="activity-empty">
              Loading persisted events…
            </p>
          ) : !visible.length ? (
            <div className="activity-empty">
              <FileClock size={28} />
              <h2>
                {query.isError
                  ? "Activity unavailable"
                  : events.length
                    ? "No events match these filters"
                    : "No persisted events in the loaded window"}
              </h2>
              <p>
                {query.isError
                  ? "Refresh to retry the protected read."
                  : "Adjust filters or inspect records in a source workspace."}
              </p>
            </div>
          ) : (
            <ol className="activity-event-list">
              {visible.map((event) => (
                <li
                  key={activityKey(event)}
                  className={
                    selected && activityKey(selected) === activityKey(event)
                      ? "activity-event-selected"
                      : ""
                  }
                >
                  <article>
                    <div className="activity-event-top">
                      <time dateTime={event.timestamp}>
                        {timestamp(event.timestamp)}
                      </time>
                      <span
                        className={`activity-source activity-source-${event.source}`}
                      >
                        {event.source}
                      </span>
                      <button
                        aria-label={`Inspect ${event.source} event ${event.id}`}
                        aria-pressed={
                          !!selected &&
                          activityKey(selected) === activityKey(event)
                        }
                        onClick={() => setChosen(activityKey(event))}
                      >
                        Inspect event →
                      </button>
                    </div>
                    <h2>{event.event_type.replaceAll("_", " ")}</h2>
                    <p>
                      Recorded {event.source} event · metadata from the
                      persisted recent feed.
                    </p>
                    <div className="activity-event-identity">
                      <span>EVENT ID</span>
                      <code>{event.id}</code>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          )}
          <footer className="activity-pagination">
            <small>
              Showing {filtered.length ? currentPage * 6 + 1 : 0}–
              {currentPage * 6 + visible.length} of {filtered.length} matching
              loaded events
            </small>
            <div>
              <button
                disabled={!currentPage}
                onClick={() => {
                  setPage(currentPage - 1);
                  setChosen("");
                }}
              >
                Previous
              </button>
              <span>
                Page {currentPage + 1} / {pages}
              </span>
              <button
                disabled={currentPage + 1 >= pages}
                onClick={() => {
                  setPage(currentPage + 1);
                  setChosen("");
                }}
              >
                Next
              </button>
            </div>
          </footer>
        </section>
        <aside className="activity-sidebar">
          <section
            className="activity-inspector"
            aria-label="Selected event details"
          >
            <header>
              <div>
                <p>LOG DEEP DIVE</p>
                <h2>Event Inspector</h2>
              </div>
              <span className="activity-tag">
                {selected ? "RECORDED" : "NO SELECTION"}
              </span>
            </header>
            {selected ? (
              <>
                <code className="activity-inspector-id">{selected.id}</code>
                <dl>
                  <div>
                    <dt>Source</dt>
                    <dd>{selected.source}</dd>
                  </div>
                  <div>
                    <dt>Event type</dt>
                    <dd>{selected.event_type}</dd>
                  </div>
                  <div>
                    <dt>Recorded at</dt>
                    <dd>{timestamp(selected.timestamp)}</dd>
                  </div>
                  <div>
                    <dt>Severity</dt>
                    <dd>Not provided by this feed</dd>
                  </div>
                </dl>
                <div className="activity-frame-note">
                  <ScanLine size={24} />
                  <h3>Frame not included</h3>
                  <p>
                    This feed does not associate a screenshot or full payload
                    with this event.
                  </p>
                  {origin && (
                    <Link to={origin.path}>
                      Browse {origin.label} workspace <ArrowUpRight size={13} />
                    </Link>
                  )}
                </div>
                <div className="activity-json-heading">
                  <h3>
                    <Braces size={15} /> Event Metadata JSON
                  </h3>
                  <button onClick={() => void copy()}>
                    <Copy size={13} /> Copy JSON
                  </button>
                </div>
                <pre>{selectedJson}</pre>
                {copied?.value === selectedJson && (
                  <p role="status" className="activity-copy-status">
                    {copied.ok
                      ? "Event metadata copied"
                      : "Copy unavailable. Select the displayed JSON manually."}
                  </p>
                )}
                <p className="activity-proof-note">
                  This view does not provide event signatures, cryptographic
                  certificates or proof of task success.
                </p>
              </>
            ) : (
              <div className="activity-empty">
                <Braces size={25} />
                <p>Select a visible event to inspect its recorded metadata.</p>
              </div>
            )}
          </section>
          <section
            className="activity-feed-status"
            aria-label="Feed scope and refresh"
          >
            <header>
              <RefreshCw size={17} />
              <h2>Feed Scope & Refresh</h2>
            </header>
            <dl>
              <div>
                <dt>This view</dt>
                <dd>
                  {!token
                    ? "Not connected"
                    : query.isError
                      ? "Read unavailable"
                      : !polling
                        ? "Auto-refresh paused"
                        : "Auto-refresh every 5s"}
                </dd>
              </div>
              <div>
                <dt>Loaded events</dt>
                <dd>{loaded ? events.length : "Unavailable"}</dd>
              </div>
              <div>
                <dt>Last successful read</dt>
                <dd>
                  {loaded
                    ? new Date(query.dataUpdatedAt).toLocaleString()
                    : "Unavailable"}
                </dd>
              </div>
            </dl>
            <p>
              Pausing affects this view's automatic reads. Execution and
              recovery keep their own controls.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
