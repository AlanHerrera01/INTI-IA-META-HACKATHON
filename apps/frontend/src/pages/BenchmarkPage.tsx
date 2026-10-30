import { useQuery } from "@tanstack/react-query";
import { BarChart3, ExternalLink } from "lucide-react";
import { benchmarkApi } from "../services/missionApi";
import { errorMessage } from "../services/api";
import { RatioMetric } from "../components/RatioMetric";
import type { BenchmarkArtifact } from "../types/mission";
import "../styles/mission.css";
export function BenchmarkPage() {
  const query = useQuery({
    queryKey: ["benchmarks"],
    queryFn: benchmarkApi.list,
    staleTime: 60000,
  });
  return (
    <div className="mission-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            MEASURED EVIDENCE / REPRODUCIBLE LOCAL TRIALS
          </p>
          <h1>Benchmark Lab</h1>
          <p>Results, denominators and the boundaries of every claim.</p>
        </div>
        <BarChart3 className="accent" size={30} />
      </div>
      {query.isLoading && <p role="status">Loading measured reports…</p>}
      {query.error && (
        <p className="mission-error" role="alert">
          {errorMessage(query.error)}
        </p>
      )}
      {query.data?.items.length === 0 && (
        <section className="mission-card">
          <h2>No benchmark evidence yet</h2>
          <p>
            Run the documented evaluation harness. No example scores are
            displayed.
          </p>
        </section>
      )}
      {query.data?.unavailable && query.data.unavailable.length > 0 && (
        <aside className="mission-note">
          Unavailable reports: {query.data.unavailable.join(", ")}. They are
          listed rather than replaced with example values.
        </aside>
      )}
      <aside className="mission-note">
        Phase 6 comparative evaluation is not implemented. Real model quality,
        recovery success rate, execution latency and unsafe-action count have no
        comparative measurements here. Missing metrics stay unavailable.
      </aside>
      {query.data?.items.map((report) => (
        <BenchmarkReport key={report.report_id} report={report} />
      ))}
    </div>
  );
}
function BenchmarkReport({ report }: { report: BenchmarkArtifact }) {
  const d = report.data;
  const verdictCounts = (d.results ?? []).reduce<Record<string, number>>(
    (counts, result) => {
      counts[result.actual_verdict] = (counts[result.actual_verdict] ?? 0) + 1;
      return counts;
    },
    {},
  );
  return (
    <section className="mission-card">
      <div className="mission-section-title">
        <div>
          <p className="eyebrow">
            {report.report_id === "verification"
              ? "ACTUAL CHROMIUM + SQLITE · ZERO MODEL CALLS"
              : "SYNTHETIC POLICY FIXTURES · NO EXECUTION"}
          </p>
          <h2>
            {report.report_id === "verification"
              ? "Independent verification"
              : "Planning policy regression"}
          </h2>
        </div>
        <span className="mission-source">
          {d.scenarios ?? d.evaluated ?? "Unknown"} scenarios
        </span>
      </div>
      <p>{report.evaluation_mode}</p>
      {report.report_id === "verification" ? (
        <>
          <div className="benchmark-metrics">
            <RatioMetric
              label="Verified task success"
              ratio={d.verification_success_rate}
            />
            <RatioMetric
              label="Expected verdict agreement"
              ratio={d.verdict_accuracy}
            />
            <RatioMetric
              label="False positives detected"
              ratio={d.false_positive_detection_rate}
            />
            <RatioMetric label="Inconclusive" ratio={d.inconclusive_rate} />
          </div>
          <div className="mission-stats">
            <div>
              <small>Verification latency · mean</small>
              <strong>
                {d.mean_verification_latency_ms?.toFixed(1) ?? "—"} ms
              </strong>
            </div>
            <div>
              <small>Model calls</small>
              <strong>{d.model_calls ?? "—"}</strong>
            </div>
            <div>
              <small>Evidence collection failures</small>
              <strong>{d.evidence_collection_failures ?? "—"}</strong>
            </div>
            <div>
              <small>Observed verifier mutations</small>
              <strong>
                {d.observed_inventory_mutations_by_verifier ?? "—"}
              </strong>
            </div>
          </div>
          <div className="mission-stats">
            <div>
              <small>Evaluated systems</small>
              <strong>1 · local Chromium + SQLite</strong>
            </div>
            <div>
              <small>Valid runs</small>
              <strong>{d.scenarios ?? d.evaluated ?? "Unavailable"}</strong>
            </div>
            <div>
              <small>Recovery success rate</small>
              <strong>Unavailable</strong>
            </div>
            <div>
              <small>Execution latency</small>
              <strong>Unavailable</strong>
            </div>
            <div>
              <small>Unsafe actions</small>
              <strong>Unavailable</strong>
            </div>
          </div>
          <div className="benchmark-categories">
            <h3>Failure and verdict categories</h3>
            {Object.keys(verdictCounts).length ? (
              <ul>
                {Object.entries(verdictCounts).map(([verdict, count]) => (
                  <li key={verdict}>
                    <span>{verdict.replaceAll("_", " ")}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mission-muted">
                No per-run verdict categories in this source.
              </p>
            )}
          </div>
          <p className="mission-note">
            One trial per deterministic fault. The success rate describes this
            fault mix, not model reliability. “Verifier mutations” is an
            inventory comparison, not a global unsafe-action metric. Recovery
            success, execution latency and unsafe actions were not measured.
          </p>
          <div className="mission-table-wrap">
            <table className="mission-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Execution</th>
                  <th>Independent verdict</th>
                  <th>Verification latency</th>
                </tr>
              </thead>
              <tbody>
                {d.results?.map((r) => (
                  <tr key={r.scenario}>
                    <td>{r.scenario.replaceAll("_", " ")}</td>
                    <td>{r.execution_status}</td>
                    <td>{r.actual_verdict}</td>
                    <td>{r.latency_ms.toFixed(1)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>
          Expected policy outcome agreement:{" "}
          {d.expected_outcome_match_rate === undefined
            ? "Unavailable"
            : `${(d.expected_outcome_match_rate * 100).toFixed(1)}%`}{" "}
          across {d.evaluated} fixtures. This measures deterministic validation,
          not visual accuracy or successful execution.
        </p>
      )}
      <details>
        <summary>Source, methodology and unavailable measurements</summary>
        <p>Recorded: {d.recorded_at || "Not recorded in source"}</p>
        <code className="evidence-hash">SHA-256 {report.sha256}</code>
        <ul>
          {report.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <a
          className="mission-link"
          href={`https://github.com/AlanHerrera01/INTI-IA-META-HACKATHON/blob/main/benchmarks/reports/${report.filename}`}
          target="_blank"
          rel="noreferrer"
        >
          Inspect committed source <ExternalLink size={13} />
        </a>
      </details>
    </section>
  );
}
