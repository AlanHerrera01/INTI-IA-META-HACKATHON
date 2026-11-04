import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Download, ShieldCheck, History } from "lucide-react";
import { verificationApi } from "../services/verificationApi";
import { errorMessage } from "../services/api";
import { useRecordEvents } from "../hooks/useRecordEvents";
import { VerdictBadge } from "../features/verification/VerdictBadge";
import {
  VerificationMetrics,
  VerificationPipeline,
  VerificationLedger,
} from "../features/verification/VerificationPanels";
import { useOperator } from "../hooks/useOperator";
import {
  verificationTerminal,
  type VerificationBundle,
  type VerificationReport,
  type Value,
} from "../types/verification";
import "../styles/execution.css";
import "../styles/verification.css";
import "../styles/verification-lab.css";

const valueText = (value: Value | undefined) =>
  value == null
    ? "Unknown"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

export function VerificationPage() {
  const { token, setToken } = useOperator();
  // Remount protected content when the capability changes, including event cursors.
  return (
    <VerificationWorkspace key={token} token={token} setToken={setToken} />
  );
}

function VerificationWorkspace({
  token,
  setToken,
}: {
  token: string;
  setToken: (token: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [id, setId] = useState(
    () => new URLSearchParams(location.search).get("verification") || "",
  );
  const [execution, setExecution] = useState(
    () => new URLSearchParams(location.search).get("execution") || "",
  );
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useQueryClient();
  const history = useQuery({
    queryKey: ["verifications", token, offset],
    queryFn: () => verificationApi.list(token, offset),
    enabled: !!token,
    refetchInterval: 10000,
  });
  const items = useMemo(
    () => (token && !history.isError ? history.data?.items || [] : []),
    [token, history.isError, history.data],
  );
  const selected = useQuery({
    queryKey: ["verification", token, id],
    queryFn: () => verificationApi.get(id, token),
    enabled: !!token && !!id,
    refetchInterval: 3000,
  });
  const bundle =
    token && !selected.isError && selected.data?.session.id === id
      ? selected.data
      : undefined;
  const reportQuery = useQuery({
    queryKey: ["verification-report", token, id],
    queryFn: () => verificationApi.report(id, token),
    enabled: !!bundle,
    refetchInterval: 10000,
  });
  const report =
    bundle &&
    !reportQuery.isError &&
    reportQuery.data?.verification_id === id &&
    reportQuery.data.execution_id === bundle.session.execution_id &&
    reportQuery.data.criteria_version.id === bundle.criteria_version.id &&
    reportQuery.data.criteria_version.digest === bundle.criteria_version.digest
      ? reportQuery.data
      : undefined;
  useEffect(() => {
    if (!id && items.length) {
      const initial =
        items.find((item) => item.session.execution_id === execution) ||
        (!execution ? items[0] : undefined);
      if (initial) setId(initial.session.id);
    }
  }, [id, items, execution]);
  const choose = (item: VerificationBundle) => {
    setId(item.session.id);
    setExecution(item.session.execution_id);
    setError("");
  };
  const run = async (work: () => Promise<VerificationBundle>) => {
    setBusy(true);
    setError("");
    try {
      const next = await work();
      choose(next);
      query.setQueryData(["verification", token, next.session.id], next);
      await query.invalidateQueries({ queryKey: ["verifications"] });
      await query.invalidateQueries({
        queryKey: ["verification-report", token, next.session.id],
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const refresh = () => {
    void history.refetch();
    if (id) {
      void selected.refetch();
      void reportQuery.refetch();
    }
  };
  const disconnect = () => {
    setToken("");
    for (const key of [
      "verification",
      "verifications",
      "verification-report",
      "verification-artifact",
    ])
      query.removeQueries({ queryKey: [key] });
  };
  return (
    <div className="execution-workspace verification-workspace verification-lab">
      <div className="verification-heading">
        <div>
          <p className="verification-kicker">
            <span>{token ? "OPERATOR CONNECTED" : "PROTECTED EVIDENCE"}</span>{" "}
            INDEPENDENT OUTCOME VALIDATION
          </p>
          <h1>Verification Lab</h1>
          <p>
            Independent outcome validation — verify the result with recorded
            evidence.
          </p>
        </div>
        <div className="verification-heading-actions">
          <a href="#verification-ledger">
            <History size={15} /> Audit Ledger
          </a>
          <button
            onClick={refresh}
            disabled={!token || selected.isFetching || history.isFetching}
          >
            <RefreshCw size={15} /> Refresh evidence
          </button>
        </div>
      </div>
      <details className="execution-panel verification-access" open={!token}>
        <summary>
          {token
            ? "Operator connected · Manage access"
            : "Connect to protected evidence"}
        </summary>
        <form
          className="execution-auth"
          onSubmit={(event) => {
            event.preventDefault();
            setToken(draft.trim());
          }}
        >
          <label>
            Operator token
            <input
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Local operator capability"
            />
          </label>
          <button disabled={!draft.trim() || busy}>Connect</button>
          {token && (
            <button type="button" onClick={disconnect}>
              Disconnect
            </button>
          )}
          <small>
            Capability stays in memory. Verification reads application state
            independently.
          </small>
        </form>
      </details>
      {(error || history.error || selected.error || reportQuery.error) && (
        <p role="alert" className="execution-error">
          {error ||
            errorMessage(history.error || selected.error || reportQuery.error)}
          {(selected.isError || reportQuery.isError) &&
            " Current evidence unavailable. No verified verdict is displayed."}
        </p>
      )}
      <VerificationMetrics bundle={bundle} report={report} />
      <VerificationPipeline bundle={bundle} report={report} />
      <div className="verification-section-heading">
        <div>
          <p className="verification-kicker">Independent proof inspection</p>
          <h2>State Differential Engine</h2>
        </div>
        <label>
          Selected verification
          <select
            aria-label="Selected verification"
            value={items.some((item) => item.session.id === id) ? id : ""}
            onChange={(event) => {
              const item = items.find(
                (item) => item.session.id === event.target.value,
              );
              if (item) choose(item);
            }}
          >
            <option value="">Choose a saved case</option>
            {items.map((item) => (
              <option key={item.session.id} value={item.session.id}>
                {item.session.id.slice(0, 8)} · {item.session.status}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bundle ? (
        <>
          <VerificationOverview bundle={bundle} report={report} compact />
          <div className="verification-proof-grid">
            <div>
              <p className="verification-proof-label">
                EXPECTED STATE / APPROVED CONTRACT
              </p>
              <CriteriaInspector bundle={bundle} />
            </div>
            <div>
              <p className="verification-proof-label">
                OBSERVED STATE / INDEPENDENT EVIDENCE
              </p>
              <EvidenceViewer
                key={`${token}:${id}`}
                bundle={bundle}
                token={token}
              />
            </div>
          </div>
          {report && <ExecutionVerificationComparison report={report} />}
          <div className="execution-panel verification-case-controls">
            <span>Case actions</span>
            <button
              disabled={busy || verificationTerminal.has(bundle.session.status)}
              onClick={() => {
                if (window.confirm("Cancel this verification?"))
                  void run(() => verificationApi.cancel(id, token));
              }}
            >
              Cancel verification
            </button>
            <button
              disabled={
                busy || !verificationTerminal.has(bundle.session.status)
              }
              onClick={() => {
                if (
                  window.confirm(
                    "Collect a new independent evidence set for this execution?",
                  )
                )
                  void run(() =>
                    verificationApi.create(
                      bundle.session.execution_id,
                      token,
                      `recheck-${crypto.randomUUID()}`,
                    ),
                  );
              }}
            >
              <RefreshCw size={14} /> Collect fresh evidence again
            </button>
            <button
              disabled={reportQuery.isFetching}
              onClick={() => void reportQuery.refetch()}
            >
              Recheck evidence integrity
            </button>
          </div>
          <VerificationTimeline
            key={`${token}:${id}`}
            id={id}
            execution={bundle.session.execution_id}
            token={token}
          />
          {report && <ReportViewer report={report} />}
        </>
      ) : (
        <section className="execution-panel verification-empty">
          <ShieldCheck size={30} />
          <h2>Evidence before conclusions</h2>
          <p>
            {token
              ? "Choose a saved verification or enter an execution below to collect independent evidence."
              : "Connect an operator to review approved criteria, protected evidence and independent verdicts."}
          </p>
          <small>
            A completed execution does not prove a persisted business outcome.
          </small>
        </section>
      )}
      <VerificationLedger
        items={items}
        total={!history.isError ? history.data?.total || 0 : 0}
        offset={offset}
        select={choose}
        previous={() => setOffset(Math.max(0, offset - 20))}
        next={() => setOffset(offset + 20)}
      />
      <details className="execution-panel verification-manual">
        <summary>Run Manual Verification</summary>
        <p className="execution-help">
          Loads the approved criteria and collects fresh evidence. This creates
          a verification record; it does not edit inventory.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (token && execution.trim() && !busy)
              void run(() => verificationApi.create(execution.trim(), token));
          }}
        >
          <label>
            Execution ID
            <input
              value={execution}
              onChange={(event) => setExecution(event.target.value)}
              placeholder="Completed or stopped execution UUID"
            />
          </label>
          <button disabled={!token || !execution.trim() || busy}>
            <ShieldCheck size={15} /> Verify execution
          </button>
        </form>
        {busy && <p role="status">Processing verification request…</p>}
      </details>
    </div>
  );
}

function VerificationTimeline({
  id,
  execution,
  token,
}: {
  id: string;
  execution: string;
  token: string;
}) {
  const query = useQueryClient();
  const events = useRecordEvents(
    id,
    execution,
    token,
    "verification_id",
    verificationApi.events,
    () => {
      void query.invalidateQueries({ queryKey: ["verification", token, id] });
      void query.invalidateQueries({
        queryKey: ["verification-report", token, id],
      });
    },
  );
  return (
    <details className="execution-panel verification-timeline">
      <summary>Verification timeline · {events.connection}</summary>
      <ol className="execution-events">
        {events.events.map((event) => (
          <li key={event.id}>
            <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
            <strong>{event.event_type}</strong>
            <small>#{event.sequence}</small>
          </li>
        ))}
      </ol>
      {!events.events.length && <p>No events available for this case.</p>}
    </details>
  );
}

export function VerificationOverview({
  bundle,
  report,
  clock = Date.now(),
  compact = false,
}: {
  bundle: VerificationBundle;
  report?: VerificationReport;
  clock?: number;
  compact?: boolean;
}) {
  const session = bundle.session;
  const elapsed = Math.max(
    0,
    ((session.completed_at ? Date.parse(session.completed_at) : clock) -
      Date.parse(session.started_at)) /
      1000,
  );
  const failedIntegrity = report?.integrity_checks.some((item) => !item.intact);
  return (
    <section className="execution-panel">
      <div className="execution-title">
        <div>
          <h2>{bundle.criteria_version.objective}</h2>
          <small>Verification status: {session.status}</small>
        </div>
        <VerdictBadge verdict={report?.effective_verdict} />
      </div>
      {!compact && (
        <div className="execution-metrics">
          <div>
            <small>Criteria evaluated</small>
            <strong>
              {session.criteria_results.length} /{" "}
              {bundle.criteria_version.criteria.length}
            </strong>
          </div>
          <div>
            <small>Evidence records</small>
            <strong>{bundle.evidence.length}</strong>
          </div>
          <div>
            <small>Verification duration</small>
            <strong>{elapsed.toFixed(1)}s</strong>
          </div>
          <div>
            <small>Criteria version</small>
            <strong>v{bundle.criteria_version.version}</strong>
          </div>
        </div>
      )}
      <p className="execution-help">
        The verifier obtains fresh application state through a separate
        read-only interface. Execution completion does not determine this
        verdict.
      </p>
      {!report && (
        <p role="status">Checking the stored report and evidence integrity…</p>
      )}
      {failedIntegrity && (
        <p role="alert" className="execution-error">
          Stored evidence failed an integrity or provenance check. Effective
          verdict: INCONCLUSIVE.
        </p>
      )}
      {session.error_code && (
        <p role="alert" className="execution-error">
          {session.error_code}
        </p>
      )}
    </section>
  );
}

export function CriteriaInspector({ bundle }: { bundle: VerificationBundle }) {
  return (
    <section className="execution-panel">
      <h2>Criteria inspector</h2>
      <p className="execution-help">
        Required criteria decide the verdict. UNKNOWN is never treated as PASS.
      </p>
      <ol className="verification-criteria">
        {bundle.criteria_version.criteria.map((criterion) => {
          const result = bundle.session.criteria_results.find(
            (item) => item.criterion_id === criterion.id,
          );
          return (
            <li key={criterion.id}>
              <div className="execution-action-heading">
                <strong>{criterion.description}</strong>
                <span
                  className={`criterion-status criterion-${result?.status.toLowerCase() || "pending"}`}
                >
                  {result?.status || "NOT EVALUATED"}
                </span>
              </div>
              <small>
                {criterion.required ? "REQUIRED" : "OPTIONAL"} ·{" "}
                {criterion.assertion_type} ·{" "}
                {criterion.target_reference.record_id}.
                {criterion.target_reference.field}
              </small>
              <dl className="verification-values">
                <dt>Expected</dt>
                <dd>{valueText(criterion.expected_value)}</dd>
                <dt>Observed</dt>
                <dd>{result ? valueText(result.observed_value) : "Pending"}</dd>
              </dl>
              {result && <p className="execution-help">{result.explanation}</p>}
              <details>
                <summary>Evidence references and requirements</summary>
                <pre>
                  {JSON.stringify(
                    {
                      evidence_ids: result?.evidence_ids || [],
                      requirements: criterion.evidence_requirements,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </li>
          );
        })}
      </ol>
      <details>
        <summary>Approved criteria version and baseline</summary>
        <pre>{JSON.stringify(bundle.criteria_version, null, 2)}</pre>
      </details>
    </section>
  );
}

export function ExecutionVerificationComparison({
  report,
}: {
  report: VerificationReport;
}) {
  const criterion = report.criteria_version.criteria.find(
    (item) =>
      item.assertion_type === "equals" &&
      item.target_reference.field === "status",
  );
  const observed = report.criteria_results.find(
    (item) => item.criterion_id === criterion?.id,
  );
  return (
    <section className="execution-panel">
      <h2>Execution vs verification</h2>
      <div className="verification-comparison">
        <div>
          <small>What the agent attempted</small>
          <p>{report.original_objective}</p>
          <span>{report.execution_summary.action_count} planned actions</span>
        </div>
        <div>
          <small>What Playwright reported</small>
          <p>{report.execution_summary.status}</p>
          <span>
            {report.execution_summary.actions_executed} dispatches ·{" "}
            {report.execution_summary.immediate_postconditions_passed} immediate
            checks passed
          </span>
        </div>
        <div>
          <small>What the application persisted</small>
          <p>
            {observed ? valueText(observed.observed_value) : "Not established"}
          </p>
          <span>Independent read-only evidence</span>
        </div>
      </div>
      <div className="verification-final">
        <small>Independent verdict</small>
        <VerdictBadge verdict={report.effective_verdict} />
      </div>
    </section>
  );
}

function EvidenceViewer({
  bundle,
  token,
}: {
  bundle: VerificationBundle;
  token: string;
}) {
  const [chosen, setChosen] = useState("");
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  const selected =
    bundle.evidence.find((item) => item.id === chosen) ||
    bundle.evidence.find((item) => item.evidence_type === "SCREENSHOT") ||
    bundle.evidence[0];
  const content = useQuery({
    queryKey: ["verification-artifact", token, bundle.session.id, selected?.id],
    queryFn: async () => {
      const blob = await verificationApi.artifact(
        bundle.session.id,
        selected!.id,
        token,
      );
      return {
        blob,
        text:
          selected!.metadata.content_type === "application/json"
            ? await blob.text()
            : null,
      };
    },
    enabled: !!selected && !!token,
    gcTime: 0,
  });
  useEffect(() => {
    if (
      content.isError ||
      !content.data ||
      !selected ||
      selected.metadata.content_type !== "image/png"
    )
      return;
    const url = URL.createObjectURL(content.data.blob);
    setImage({ id: selected.id, url });
    return () => URL.revokeObjectURL(url);
  }, [content.data, content.isError, selected]);
  return (
    <section className="execution-panel">
      <h2>Evidence viewer</h2>
      <p className="execution-help">
        Content is authenticated and checked against stored hashes before it is
        returned.
      </p>
      <div className="verification-evidence-list">
        {bundle.evidence.map((item) => (
          <button
            key={item.id}
            aria-pressed={selected?.id === item.id}
            onClick={() => setChosen(item.id)}
          >
            {item.evidence_type}
            <small>{item.metadata.role}</small>
          </button>
        ))}
      </div>
      {selected && (
        <button
          disabled={content.isFetching}
          onClick={() => void content.refetch()}
        >
          Reload artifact
        </button>
      )}
      {!selected ? (
        <p>No evidence collected yet.</p>
      ) : (
        <>
          {content.isFetching && (
            <p role="status">Loading protected evidence…</p>
          )}
          {content.error && (
            <p role="alert" className="execution-error">
              {errorMessage(content.error)}
            </p>
          )}
          {!content.isError &&
            selected.metadata.content_type === "image/png" &&
            image?.id === selected.id && (
              <div className="execution-screen">
                <img
                  src={image.url}
                  alt="Fresh independent read-only inventory observation"
                />
              </div>
            )}
          <details className="verification-provenance">
            <summary>Evidence provenance and SHA-256</summary>
            <dl className="execution-inspector">
              <dt>Source</dt>
              <dd>{selected.source}</dd>
              <dt>Captured</dt>
              <dd>{new Date(selected.captured_at).toLocaleString()}</dd>
              <dt>Collection method</dt>
              <dd>{selected.metadata.collection_method}</dd>
              <dt>Record</dt>
              <dd>{selected.metadata.target_record_id}</dd>
              <dt>SHA-256</dt>
              <dd>{selected.content_hash}</dd>
              <dt>Artifact reference</dt>
              <dd>{selected.artifact_reference}</dd>
              <dt>Data store</dt>
              <dd>
                {selected.metadata.source_store_id || "Supplementary evidence"}
              </dd>
            </dl>{" "}
          </details>
          {!content.isError && content.data?.text && (
            <pre className="verification-json">{content.data.text}</pre>
          )}
        </>
      )}
    </section>
  );
}

function ReportViewer({ report }: { report: VerificationReport }) {
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `inti-verification-${report.verification_id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="execution-panel">
      <div className="execution-title">
        <h2>Verification report</h2>
        <button onClick={download}>
          <Download size={15} /> Download JSON
        </button>
      </div>
      <details className="verification-report-details">
        <summary>Report provenance, integrity checks and limitations</summary>
        <dl className="execution-inspector">
          <dt>Task ID</dt>
          <dd>{report.task_id}</dd>
          <dt>Execution ID</dt>
          <dd>{report.execution_id}</dd>
          <dt>Verification ID</dt>
          <dd>{report.verification_id}</dd>
          <dt>Criteria digest</dt>
          <dd>{report.criteria_version.digest}</dd>
          <dt>Historical verdict</dt>
          <dd>{report.final_verdict || "Pending"}</dd>
        </dl>
        <h3>Limitations</h3>
        <ul className="verification-limitations">
          {report.limitations.map((item, index) => (
            <li key={`${index}:${item}`}>{item}</li>
          ))}
        </ul>
        <ul className="verification-integrity-list">
          {report.integrity_checks.map((check) => (
            <li key={check.evidence_id}>
              <code>{check.evidence_id}</code>
              <span>{check.intact ? "INTACT" : "FAILED"}</span>
              {check.error && <p>{check.error}</p>}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Structured report</summary>
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </section>
  );
}
