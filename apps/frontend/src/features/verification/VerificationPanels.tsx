import {
  CheckCheck,
  Fingerprint,
  History,
  Camera,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import type {
  VerificationBundle,
  VerificationReport,
} from "../../types/verification";

export function VerificationMetrics({
  bundle,
  report,
}: {
  bundle?: VerificationBundle;
  report?: VerificationReport;
}) {
  const passed =
    bundle?.session.criteria_results.filter((item) => item.status === "PASS")
      .length || 0;
  const checks = report?.integrity_checks || [];
  const metrics = [
    {
      label: "Criteria assertions",
      value: bundle ? bundle.criteria_version.criteria.length : "—",
      detail: bundle
        ? `${passed} PASS · ${bundle.session.criteria_results.length} evaluated`
        : "Select a verification to inspect its criteria",
      icon: CheckCheck,
      color: "green",
    },
    {
      label: "Evidence collected",
      value: bundle ? bundle.evidence.length : "—",
      detail: "Recorded artifacts · protected access",
      icon: Fingerprint,
      color: "cyan",
    },
    {
      label: "Evidence integrity",
      value: report
        ? `${checks.filter((item) => item.intact).length} / ${checks.length}`
        : "—",
      detail: report
        ? `${checks.filter((item) => !item.intact).length} failed checks · revalidated report`
        : "Awaiting a revalidated report",
      icon: History,
      color: "gold",
    },
  ];
  return (
    <div className="verification-lab-metrics">
      {metrics.map(({ label, value, detail, icon: Icon, color }) => (
        <section
          aria-label={label}
          className={`verification-metric-${color}`}
          key={label}
        >
          <div>
            <span>{label}</span>
            <Icon size={20} />
          </div>
          <strong>{value}</strong>
          <p>{detail}</p>
          <div className="verification-metric-rule" />
        </section>
      ))}
    </div>
  );
}

export function VerificationPipeline({
  bundle,
  report,
}: {
  bundle?: VerificationBundle;
  report?: VerificationReport;
}) {
  const stages = [
    {
      title: "Approved criteria",
      detail:
        "The original objective and immutable criteria version define success.",
      value: bundle
        ? `VERSION ${bundle.criteria_version.version}`
        : "AWAITING SELECTION",
      icon: ListChecks,
    },
    {
      title: "Fresh evidence",
      detail:
        "Independent application state and supplementary captures are collected.",
      value: bundle
        ? `${bundle.evidence.length} ARTIFACTS RECORDED`
        : "NO CASE SELECTED",
      icon: Camera,
    },
    {
      title: "Criteria evaluation",
      detail:
        "Expected and observed values are compared. Unknown never means pass.",
      value: bundle
        ? `${bundle.session.criteria_results.length} RESULTS RECORDED`
        : "NOT EVALUATED",
      icon: CheckCheck,
    },
    {
      title: "Integrity & verdict",
      detail:
        "The report rechecks evidence integrity before exposing an effective verdict.",
      value: report?.effective_verdict || "NOT VERIFIED",
      icon: ShieldCheck,
    },
  ];
  return (
    <section className="execution-panel verification-pipeline">
      <header>
        <div>
          <p className="verification-kicker">Validation pipeline</p>
          <h2>End-to-End Verification Flow</h2>
        </div>
        <span className="verification-label">INDEPENDENT / READ ONLY</span>
      </header>
      <div className="verification-stages">
        {stages.map((stage, index) => (
          <article key={stage.title}>
            <div>
              <span>0{index + 1}</span>
              <stage.icon size={19} />
            </div>
            <h3>{stage.title}</h3>
            <p>{stage.detail}</p>
            <small>{stage.value}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function VerificationLedger({
  items,
  total,
  offset,
  select,
  previous,
  next,
}: {
  items: VerificationBundle[];
  total: number;
  offset: number;
  select: (item: VerificationBundle) => void;
  previous: () => void;
  next: () => void;
}) {
  return (
    <section
      className="execution-panel verification-ledger"
      id="verification-ledger"
    >
      <header>
        <div>
          <p className="verification-kicker">Audit ledger</p>
          <h2>Recent Independent Validations</h2>
        </div>
        <span className="verification-label">STORED HISTORY</span>
      </header>
      <p className="execution-help">
        Historical verdicts below are stored results. Inspect a case to
        revalidate its current evidence integrity.
      </p>
      <div className="verification-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Verification / execution</th>
              <th>Objective</th>
              <th>Stored outcome</th>
              <th>Timestamp</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.session.id}>
                <td>
                  <code title={item.session.id}>
                    {item.session.id.slice(0, 8)}
                  </code>
                  <small title={item.session.execution_id}>
                    {item.session.execution_id.slice(0, 8)}
                  </small>
                </td>
                <td>
                  {item.criteria_version.objective}
                  <small>
                    {item.criteria_version.criteria.length} criteria ·{" "}
                    {item.evidence.length} artifacts
                  </small>
                </td>
                <td>
                  <span className="verification-stored-outcome">
                    {item.session.final_verdict || "Pending"}
                  </span>
                  <small>{item.session.status}</small>
                </td>
                <td>{new Date(item.session.started_at).toLocaleString()}</td>
                <td>
                  <button
                    onClick={() => select(item)}
                    aria-label={`Inspect ${item.session.id}`}
                  >
                    Inspect →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && (
        <p className="verification-empty">
          No saved verifications available. Connect an operator to inspect
          protected records.
        </p>
      )}
      <footer>
        <small>
          Showing {items.length ? offset + 1 : 0}–{offset + items.length} of{" "}
          {total} saved records
        </small>
        <div>
          <button disabled={!offset} onClick={previous}>
            Previous
          </button>
          <button disabled={offset + 20 >= total} onClick={next}>
            Next
          </button>
        </div>
      </footer>
    </section>
  );
}
