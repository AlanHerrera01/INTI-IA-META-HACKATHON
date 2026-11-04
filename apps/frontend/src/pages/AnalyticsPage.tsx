import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CheckCheck,
  Clock3,
  Copy,
  Download,
  FileJson,
  Fingerprint,
  FlaskConical,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { benchmarkApi } from "../services/missionApi";
import { errorMessage } from "../services/api";
import { downloadTaskJson } from "../features/tasks/records";
import { LatencyChart } from "../features/analytics/LatencyChart";
import {
  latencyText,
  reportCount,
  reportMetrics,
  reportSamples,
  reportTitle,
  validCount,
} from "../features/analytics/metrics";
import "../styles/analytics.css";

export function AnalyticsPage() {
  const query = useQuery({
    queryKey: ["benchmarks"],
    queryFn: benchmarkApi.list,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: false,
  });
  const [chosen, setChosen] = useState("");
  const [focus, setFocus] = useState("");
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  const [copied, setCopied] = useState<{ digest: string; ok: boolean } | null>(
    null,
  );
  const items = !query.isError ? query.data?.items || [] : [];
  const report = chosen
    ? items.find((item) => item.report_id === chosen)
    : items[0];
  const samples = reportSamples(report);
  const selected = samples.find((sample) => sample.id === focus) || samples[0];
  const outcomes = [...new Set(samples.map((sample) => sample.outcome))];
  const filtered = samples.filter(
    (sample) =>
      (!outcome || sample.outcome === outcome) &&
      `${sample.name} ${sample.method} ${sample.outcome}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const verification = report?.report_id === "verification";
  const groups = outcomes.map((name) => ({
    name,
    count: samples.filter((sample) => sample.outcome === name).length,
  }));
  const choose = (id: string) => {
    setChosen(id);
    setFocus("");
    setSearch("");
    setOutcome("");
  };
  const copy = async () => {
    if (!report || !/^[a-f0-9]{64}$/i.test(report.sha256)) return;
    try {
      await navigator.clipboard.writeText(report.sha256);
      setCopied({ digest: report.sha256, ok: true });
    } catch {
      setCopied({ digest: report.sha256, ok: false });
    }
  };
  return (
    <div className="analytics-workspace">
      <header className="analytics-heading">
        <div className="analytics-heading-top">
          <div>
            <p className="analytics-eyebrow">
              <span>RECORDED EVALUATION EVIDENCE</span> LOCAL REPORTS / NO LIVE
              INFERENCE
            </p>
            <h1>Analytics & Benchmarks</h1>
            <p>
              Inspect measured verifier trials and synthetic planning-policy
              results, with their original scope and denominators.
            </p>
          </div>
          <div className="analytics-heading-actions">
            <button
              disabled={!report || query.isFetching}
              onClick={() =>
                report &&
                downloadTaskJson(
                  `inti-benchmark-${report.report_id}.json`,
                  report,
                )
              }
            >
              <Download size={14} /> Export report JSON
            </button>
            <button
              className="analytics-primary"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw size={14} /> Refresh reports
            </button>
          </div>
        </div>
        <div className="analytics-source-controls">
          <label>
            Evaluation source
            <select
              aria-label="Evaluation source"
              value={report?.report_id || ""}
              onChange={(event) => choose(event.target.value)}
            >
              <option value="" disabled>
                Select a report
              </option>
              {items.map((item) => (
                <option key={item.report_id} value={item.report_id}>
                  {reportTitle(item)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span>Methodology</span>
            <strong>
              {report
                ? verification
                  ? "Actual Chromium + SQLite"
                  : report.report_id === "planning-policy"
                    ? "Synthetic policy fixtures"
                    : report.evaluation_mode
                : "Unavailable"}
            </strong>
          </div>
          <div>
            <span>Source recorded</span>
            <strong>
              {report?.data.recorded_at
                ? new Date(report.data.recorded_at).toLocaleString()
                : "Not recorded in source"}
            </strong>
          </div>
        </div>
      </header>
      {query.isPending && (
        <p role="status" className="analytics-note">
          Loading recorded evaluation reports…
        </p>
      )}
      {query.isError && (
        <p role="alert" className="analytics-error">
          {errorMessage(query.error)} Current reports are unavailable; cached
          metrics and exports are hidden.
        </p>
      )}
      {!query.isError && query.data?.unavailable.length ? (
        <p role="status" className="analytics-note">
          Unavailable report sources: {query.data.unavailable.join(", ")}
        </p>
      ) : null}
      <aside className="analytics-scope">
        <FlaskConical size={17} />
        <p>
          {verification
            ? "One trial per deterministic fault. The task-success rate describes this fault mix, not live model reliability."
            : report
              ? "Synthetic policy validation is not visual accuracy, inference performance or successful task execution."
              : "Select a recorded report to inspect its measurements."}{" "}
          <span>
            Comparative model performance, recovery success, browser execution
            latency and global unsafe-action counts remain unmeasured in these
            reports.
          </span>
        </p>
      </aside>
      <div className="analytics-metrics">
        {reportMetrics(report).map((metric, index) => {
          const Icon = [ShieldCheck, Clock3, CheckCheck, BarChart3][index];
          return (
            <section
              key={metric.label}
              aria-label={metric.label}
              className={`analytics-metric-${index}`}
            >
              <div>
                <span>{metric.label}</span>
                <Icon size={17} />
              </div>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
              {metric.percent !== null ? (
                <div className="analytics-metric-track">
                  <span style={{ width: `${metric.percent}%` }} />
                </div>
              ) : (
                <div className="analytics-metric-rule" />
              )}
            </section>
          );
        })}
      </div>
      {report ? (
        <>
          <div className="analytics-analysis-grid">
            <section
              className="analytics-card analytics-chart-panel"
              aria-label="Recorded scenario latency"
            >
              <header>
                <div>
                  <h2>
                    <TrendingUp size={17} /> Recorded Scenario Latency
                  </h2>
                  <p>
                    {verification
                      ? "Independent verifier timing"
                      : "Deterministic policy validation timing"}{" "}
                    · full selected report
                  </p>
                </div>
                <span className="analytics-tag">SOURCE ORDER / MS</span>
              </header>
              <LatencyChart
                key={report.sha256}
                rows={samples}
                selected={selected?.id}
                select={setFocus}
              />
              {selected && (
                <div className="analytics-chart-inspector">
                  <span>SELECTED SAMPLE</span>
                  <h3>{selected.name.replaceAll("_", " ")}</h3>
                  <div>
                    <strong>{latencyText(selected.latency)}</strong>
                    <span>{selected.outcome.replaceAll("_", " ")}</span>
                  </div>
                </div>
              )}
            </section>
            <aside
              className="analytics-card analytics-coverage"
              aria-label="Evaluation coverage"
            >
              <header>
                <FileJson size={17} />
                <h2>Evaluation Sources</h2>
                <span className="analytics-tag">{items.length} REPORTS</span>
              </header>
              <p>
                These methods measure different behaviors. They do not form a
                model leaderboard.
              </p>
              <div>
                {items.map((item) => (
                  <button
                    key={item.report_id}
                    aria-pressed={item.report_id === report.report_id}
                    onClick={() => choose(item.report_id)}
                  >
                    <span>{reportTitle(item)}</span>
                    <strong>{reportCount(item) ?? "Unavailable"}</strong>
                    <small>
                      {item.report_id === "verification"
                        ? "Recorded fault trials"
                        : "Synthetic policy fixtures"}
                    </small>
                  </button>
                ))}
              </div>
              <dl>
                <div>
                  <dt>Selected report model calls</dt>
                  <dd>
                    {validCount(report.data.model_calls) ?? "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Evaluated method</dt>
                  <dd>
                    {verification ? "Local verifier" : "Policy validation"}
                  </dd>
                </div>
                <div>
                  <dt>Cross-model comparison</dt>
                  <dd>Not measured here</dd>
                </div>
              </dl>
              <p className="analytics-coverage-limit">
                Report agreement is separate from persisted goal success. A
                completed execution can still produce a verified failure.
              </p>
            </aside>
          </div>
          <div
            className="analytics-outcomes"
            aria-label="Recorded outcome breakdown"
          >
            {groups.length ? (
              groups.map((group) => (
                <section className="analytics-card" key={group.name}>
                  <div>
                    <span
                      className={`analytics-outcome-dot analytics-outcome-${group.name.toLowerCase()}`}
                    />
                    <h3>{group.name.replaceAll("_", " ")}</h3>
                  </div>
                  <strong>{group.count}</strong>
                  <small>
                    {group.count} / {samples.length} recorded scenarios in this
                    report
                  </small>
                  <div className="analytics-outcome-track">
                    <span
                      style={{
                        width: `${(group.count / samples.length) * 100}%`,
                      }}
                    />
                  </div>
                </section>
              ))
            ) : (
              <p className="analytics-note">
                Per-scenario outcomes are unavailable in this source.
              </p>
            )}
          </div>
          <section
            className="analytics-card analytics-results"
            aria-label="Scenario results"
          >
            <header>
              <div>
                <h2>
                  <BarChart3 size={17} /> Breakdown by Scenario & Recorded
                  Outcome
                </h2>
                <p>
                  Filters affect this table. Report metrics keep their original
                  denominators.
                </p>
              </div>
              <span className="analytics-tag">
                {filtered.length} / {samples.length} ROWS
              </span>
            </header>
            <div className="analytics-table-filters">
              <label>
                <Search size={14} />
                <input
                  aria-label="Search benchmark scenarios"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search scenarios or outcomes…"
                />
              </label>
              <label>
                Recorded outcome
                <select
                  aria-label="Recorded outcome"
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                >
                  <option value="">All outcomes</option>
                  {outcomes.map((value) => (
                    <option value={value} key={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="analytics-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Execution / method</th>
                    <th>Recorded outcome</th>
                    <th>Latency</th>
                    <th>Agreement</th>
                    <th>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sample) => (
                    <tr
                      key={sample.id}
                      className={
                        selected?.id === sample.id
                          ? "analytics-selected-row"
                          : ""
                      }
                    >
                      <td>{sample.name.replaceAll("_", " ")}</td>
                      <td>{sample.method}</td>
                      <td>
                        <span className="analytics-table-outcome">
                          {sample.outcome.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>{latencyText(sample.latency)}</td>
                      <td>
                        {sample.agreement === null
                          ? "Not recorded"
                          : sample.agreement
                            ? "Expected outcome"
                            : "Mismatch"}
                      </td>
                      <td>
                        <button
                          aria-label={`Inspect scenario ${sample.name}`}
                          aria-pressed={selected?.id === sample.id}
                          onClick={() => setFocus(sample.id)}
                        >
                          Inspect →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <p className="analytics-empty">
                {samples.length
                  ? "No scenarios match these filters."
                  : "No per-scenario records in this report."}
              </p>
            )}
            <p className="analytics-table-count">
              Showing {filtered.length} of {samples.length} source rows ·{" "}
              {reportCount(report) ?? "Unknown"} evaluated scenarios declared by
              the report
            </p>
            {selected && (
              <details
                key={`${report.sha256}:${selected.id}`}
                className="analytics-record-inspector"
              >
                <summary>
                  Selected scenario record: {selected.name.replaceAll("_", " ")}
                </summary>
                <dl>
                  <div>
                    <dt>Expected verdict</dt>
                    <dd>
                      {selected.expected || "Not supplied as a named verdict"}
                    </dd>
                  </div>
                  <div>
                    <dt>Recorded outcome</dt>
                    <dd>{selected.outcome}</dd>
                  </div>
                  <div>
                    <dt>Evidence source available</dt>
                    <dd>
                      {selected.sourceAvailable === null
                        ? verification
                          ? "Not recorded"
                          : "Not measured for policy fixtures"
                        : selected.sourceAvailable
                          ? "Yes"
                          : "No"}
                    </dd>
                  </div>
                </dl>
                <p>
                  Archived harness records are not links to current workspace
                  executions.
                </p>
                <pre>{JSON.stringify(selected.raw, null, 2)}</pre>
              </details>
            )}
          </section>
          <section
            className="analytics-card analytics-methodology"
            aria-label="Report methodology"
          >
            <header>
              <FlaskConical size={17} />
              <h2>Source, Methodology & Measurement Boundaries</h2>
              <span className="analytics-tag">ARCHIVED REPORT</span>
            </header>
            <dl>
              <div>
                <dt>Evaluation mode</dt>
                <dd>{report.evaluation_mode}</dd>
              </div>
              <div>
                <dt>File</dt>
                <dd>{report.filename}</dd>
              </div>
              <div>
                <dt>Evidence collection failures</dt>
                <dd>
                  {validCount(report.data.evidence_collection_failures) ??
                    "Not measured"}
                </dd>
              </div>
              <div>
                <dt>Observed verifier inventory mutations</dt>
                <dd>
                  {validCount(
                    report.data.observed_inventory_mutations_by_verifier,
                  ) ?? "Not measured"}
                </dd>
              </div>
            </dl>
            <ul>
              {report.limitations.map((limitation, index) => (
                <li key={`${index}:${limitation}`}>{limitation}</li>
              ))}
            </ul>
            <p>
              The source SHA-256 identifies the server report file. Export
              packages parsed report data and source metadata; its bytes have a
              different hash.
            </p>
            <details>
              <summary>Structured report</summary>
              <pre>{JSON.stringify(report, null, 2)}</pre>
            </details>
          </section>
        </>
      ) : !query.isPending && !query.isError ? (
        <section className="analytics-card analytics-empty">
          <FileJson size={30} />
          <h2>No benchmark evidence available</h2>
          <p>
            {chosen
              ? "The selected report is unavailable. Choose another available source."
              : "No recorded evaluation reports were returned by the backend."}
          </p>
        </section>
      ) : null}
      <div className="analytics-audit">
        <Fingerprint size={19} />
        <div>
          <strong>Source fingerprint</strong>
          <code>{report?.sha256 || "Unavailable"}</code>
        </div>
        <button
          disabled={!report || !/^[a-f0-9]{64}$/i.test(report.sha256)}
          onClick={() => void copy()}
        >
          <Copy size={14} /> Copy source hash
        </button>
        {report && copied?.digest === report.sha256 && (
          <span role="status">
            {copied.ok
              ? "Source hash copied"
              : "Copy unavailable. Select the displayed hash manually."}
          </span>
        )}
      </div>
    </div>
  );
}
