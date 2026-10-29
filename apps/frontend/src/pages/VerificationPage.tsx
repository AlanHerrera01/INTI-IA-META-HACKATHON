import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, RefreshCw, Download, ShieldCheck } from "lucide-react";
import { verificationApi } from "../services/verificationApi";
import { errorMessage } from "../services/api";
import { useRecordEvents } from "../hooks/useRecordEvents";
import { VerdictBadge } from "../features/verification/VerdictBadge";
import {
  verificationTerminal,
  type VerificationBundle,
  type VerificationReport,
  type Value,
} from "../types/verification";
import "../styles/execution.css";
import "../styles/verification.css";

const valueText = (value: Value | undefined) =>
  value == null
    ? "Unknown"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

export function VerificationPage() {
  const [draft, setDraft] = useState("");
  const [token, setToken] = useState("");
  const [id, setId] = useState("");
  const [execution, setExecution] = useState(
    () => new URLSearchParams(location.search).get("execution") || "",
  );
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const query = useQueryClient();
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const history = useQuery({
    queryKey: ["verifications", token, offset],
    queryFn: () => verificationApi.list(token, offset),
    enabled: !!token,
    refetchInterval: 3000,
  });
  const selected = useQuery({
    queryKey: ["verification", token, id],
    queryFn: () => verificationApi.get(id, token),
    enabled: !!token && !!id,
    refetchInterval: 1000,
  });
  const report = useQuery({
    queryKey: ["verification-report", token, id],
    queryFn: () => verificationApi.report(id, token),
    enabled: !!token && !!id,
    refetchInterval: () =>
      selected.data && !verificationTerminal.has(selected.data.session.status)
        ? 1000
        : false,
  });
  const events = useRecordEvents(
    id,
    selected.data?.session.execution_id || "",
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
  const run = async (work: () => Promise<VerificationBundle>) => {
    setBusy(true);
    setError("");
    try {
      const next = await work();
      setId(next.session.id);
      setExecution(next.session.execution_id);
      query.setQueryData(["verification", token, next.session.id], next);
      await query.invalidateQueries({ queryKey: ["verifications"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = () => {
    setToken("");
    setDraft("");
    setId("");
    query.removeQueries({ queryKey: ["verification"] });
    query.removeQueries({ queryKey: ["verifications"] });
    query.removeQueries({ queryKey: ["verification-report"] });
  };
  return (
    <div className="execution-workspace verification-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">DEFINE SUCCESS · COLLECT EVIDENCE · DECIDE</p>
          <h1>Verification Center</h1>
          <p>
            Independent, read-only evidence for the original task objective.
          </p>
        </div>
        <span className="execution-chip">PHASE 05</span>
      </div>
      <form
        className="execution-auth"
        onSubmit={(event) => {
          event.preventDefault();
          setToken(draft);
          setId("");
          setError("");
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
        <button disabled={!draft || busy}>Connect</button>
        {token && (
          <button type="button" onClick={disconnect}>
            Disconnect
          </button>
        )}
        <small>
          Capability stays in memory. Verification cannot edit the application.
        </small>
      </form>
      {(error || history.error || selected.error || report.error) && (
        <p role="alert" className="execution-error">
          {error ||
            errorMessage(history.error || selected.error || report.error)}
        </p>
      )}
      <div className="execution-layout">
        <aside className="execution-panel">
          <h2>Verify an execution</h2>
          <label>
            Execution ID
            <input
              value={execution}
              onChange={(event) => setExecution(event.target.value)}
              placeholder="Completed or stopped execution UUID"
            />
          </label>
          <button
            disabled={!token || !execution || busy}
            onClick={() =>
              void run(() => verificationApi.create(execution, token))
            }
          >
            <ShieldCheck size={15} /> Verify execution
          </button>
          <p className="execution-help">
            Loads the approved criteria and collects fresh evidence. Repeated
            requests return the same verification for that criteria version.
          </p>
          {busy && <p role="status">Processing verification request…</p>}
          <h2>Verification history</h2>
          {history.isFetching && <small>Refreshing saved records…</small>}
          {history.data?.items.length === 0 && (
            <p>No verification records yet.</p>
          )}
          <div className="execution-history">
            {history.data?.items.map((item) => (
              <button
                key={item.session.id}
                aria-pressed={id === item.session.id}
                onClick={() => {
                  setId(item.session.id);
                  setExecution(item.session.execution_id);
                  setError("");
                }}
              >
                <strong>
                  {item.session.final_verdict || item.session.status}
                </strong>
                <span>{item.criteria_version.objective}</span>
                <small>
                  {new Date(item.session.started_at).toLocaleString()}
                </small>
              </button>
            ))}
          </div>
          <div className="execution-controls">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous
            </button>
            <button
              disabled={!history.data || offset + 20 >= history.data.total}
              onClick={() => setOffset(offset + 20)}
            >
              Next
            </button>
          </div>
        </aside>
        <section className="execution-main">
          {!selected.data ? (
            <div className="execution-panel">
              <FileCheck2 size={28} />
              <h2>Evidence before conclusions</h2>
              <p>
                Connect to review verification history, or enter an execution ID
                to collect independent evidence.
              </p>
              <p className="execution-help">
                A completed browser workflow and a saved confirmation message do
                not prove a persisted business outcome.
              </p>
            </div>
          ) : (
            <>
              <VerificationOverview
                bundle={selected.data}
                report={report.data}
                clock={clock}
              />
              <div className="execution-panel execution-controls">
                <button
                  disabled={
                    busy ||
                    verificationTerminal.has(selected.data.session.status)
                  }
                  onClick={() =>
                    void run(() => verificationApi.cancel(id, token))
                  }
                >
                  Cancel verification
                </button>
                <button
                  disabled={
                    busy ||
                    !verificationTerminal.has(selected.data.session.status)
                  }
                  onClick={() =>
                    void run(() =>
                      verificationApi.create(
                        selected.data!.session.execution_id,
                        token,
                        `recheck-${crypto.randomUUID()}`,
                      ),
                    )
                  }
                >
                  <RefreshCw size={15} /> Collect fresh evidence again
                </button>
                <button
                  disabled={report.isFetching}
                  onClick={() => void report.refetch()}
                >
                  Recheck evidence integrity
                </button>
              </div>
              {report.data && (
                <ExecutionVerificationComparison report={report.data} />
              )}
              <CriteriaInspector bundle={selected.data} />
              <EvidenceViewer bundle={selected.data} token={token} />
              <section className="execution-panel">
                <h2>
                  Verification timeline <small>{events.connection}</small>
                </h2>
                <ol className="execution-events">
                  {events.events.map((event) => (
                    <li key={event.id}>
                      <time>
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </time>
                      <strong>{event.event_type}</strong>
                      <small>#{event.sequence}</small>
                    </li>
                  ))}
                </ol>
              </section>
              {report.data && <ReportViewer report={report.data} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function VerificationOverview({
  bundle,
  report,
  clock = Date.now(),
}: {
  bundle: VerificationBundle;
  report?: VerificationReport;
  clock?: number;
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
      !content.data ||
      !selected ||
      selected.metadata.content_type !== "image/png"
    )
      return;
    const url = URL.createObjectURL(content.data.blob);
    setImage({ id: selected.id, url });
    return () => URL.revokeObjectURL(url);
  }, [content.data, selected]);
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
      {!selected ? (
        <p>No evidence collected yet.</p>
      ) : (
        <>
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
          </dl>
          {content.isFetching && (
            <p role="status">Loading protected evidence…</p>
          )}
          {content.error && (
            <p role="alert" className="execution-error">
              {errorMessage(content.error)}
            </p>
          )}
          {selected.metadata.content_type === "image/png" &&
            image?.id === selected.id && (
              <div className="execution-screen">
                <img
                  src={image.url}
                  alt="Fresh independent read-only inventory observation"
                />
              </div>
            )}
          {content.data?.text && (
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
      <details>
        <summary>Structured report</summary>
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </section>
  );
}
