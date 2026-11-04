import type { BenchmarkArtifact, Ratio } from "../../types/mission";

export const validCount = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
export const validLatency = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
export function ratioPercent(ratio: Ratio | undefined): number | null {
  return ratio &&
    validCount(ratio.numerator) !== null &&
    validCount(ratio.denominator) !== null &&
    ratio.denominator > 0 &&
    ratio.numerator <= ratio.denominator
    ? (ratio.numerator / ratio.denominator) * 100
    : null;
}
export const ratePercent = (rate: number | undefined): number | null =>
  typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 1
    ? rate * 100
    : null;
export const percentText = (value: number | null) =>
  value === null ? "Unavailable" : `${value.toFixed(1)}%`;
export const latencyText = (value: number | undefined | null) =>
  validLatency(value ?? undefined) === null
    ? "Unavailable"
    : `${value!.toFixed(value! < 1 ? 3 : 1)} ms`;
export const reportTitle = (report: BenchmarkArtifact) =>
  report.report_id === "verification"
    ? "Independent verification"
    : report.report_id === "planning-policy"
      ? "Planning policy fixtures"
      : report.report_id;
export const reportCount = (report: BenchmarkArtifact) =>
  validCount(report.data.scenarios ?? report.data.evaluated);

export interface BenchmarkSample {
  id: string;
  name: string;
  method: string;
  outcome: string;
  latency: number | null;
  sourceAvailable: boolean | null;
  agreement: boolean | null;
  expected: string | null;
  raw: unknown;
}
export function reportSamples(
  report: BenchmarkArtifact | undefined,
): BenchmarkSample[] {
  if (!report) return [];
  if (report.report_id === "verification")
    return (report.data.results || []).map((row, index) => ({
      id: `${index}:${row.scenario}`,
      name: row.scenario,
      method: row.execution_status,
      outcome: row.actual_verdict || "UNKNOWN",
      latency: validLatency(row.latency_ms),
      sourceAvailable:
        typeof row.source_available === "boolean" ? row.source_available : null,
      agreement: row.expected_verdict
        ? row.actual_verdict === row.expected_verdict
        : null,
      expected: row.expected_verdict || null,
      raw: row,
    }));
  if (report.report_id === "planning-policy")
    return (report.data.rows || []).map((row, index) => ({
      id: `${index}:${row.id}`,
      name: row.id,
      method: "Policy fixture · not executed",
      outcome: row.status || "UNKNOWN",
      latency: validLatency(row.latency_ms),
      sourceAvailable: null,
      agreement:
        typeof row.expected_outcome_matched === "boolean"
          ? row.expected_outcome_matched
          : null,
      expected: null,
      raw: row,
    }));
  return [];
}

export function reportMetrics(report: BenchmarkArtifact | undefined) {
  const data = report?.data;
  const policy = report?.report_id === "planning-policy";
  const verification = report?.report_id === "verification";
  const ratio = (value: Ratio | undefined) =>
    ratioPercent(value) === null
      ? "No valid ratio supplied"
      : `${value!.numerator} / ${value!.denominator} recorded cases`;
  return policy
    ? [
        {
          label: "Expected policy agreement",
          value: percentText(ratePercent(data?.expected_outcome_match_rate)),
          detail: `${reportCount(report!) ?? "Unknown"} synthetic fixtures · not task success`,
          percent: ratePercent(data?.expected_outcome_match_rate),
        },
        {
          label: "Policy latency · mean",
          value: latencyText(data?.mean_latency_ms),
          detail: "Deterministic validation timing · not inference",
          percent: null,
        },
        {
          label: "Schema validity",
          value: percentText(ratePercent(data?.schema_validity_rate)),
          detail: "Rate supplied by the policy fixture report",
          percent: ratePercent(data?.schema_validity_rate),
        },
        {
          label: "Unsupported action rate",
          value: percentText(ratePercent(data?.unsupported_action_rate)),
          detail: "Fixture validation · not observed unsafe actions",
          percent: ratePercent(data?.unsupported_action_rate),
        },
      ]
    : [
        {
          label: "Verified task success",
          value: percentText(
            ratioPercent(
              verification ? data?.verification_success_rate : undefined,
            ),
          ),
          detail: ratio(
            verification ? data?.verification_success_rate : undefined,
          ),
          percent: ratioPercent(
            verification ? data?.verification_success_rate : undefined,
          ),
        },
        {
          label: "Verification latency · mean",
          value: latencyText(
            verification ? data?.mean_verification_latency_ms : undefined,
          ),
          detail: "Verifier timing · not browser execution latency",
          percent: null,
        },
        {
          label: "Expected verdict agreement",
          value: percentText(
            ratioPercent(verification ? data?.verdict_accuracy : undefined),
          ),
          detail: ratio(verification ? data?.verdict_accuracy : undefined),
          percent: ratioPercent(
            verification ? data?.verdict_accuracy : undefined,
          ),
        },
        {
          label: "False positives detected",
          value: percentText(
            ratioPercent(
              verification ? data?.false_positive_detection_rate : undefined,
            ),
          ),
          detail: ratio(
            verification ? data?.false_positive_detection_rate : undefined,
          ),
          percent: ratioPercent(
            verification ? data?.false_positive_detection_rate : undefined,
          ),
        },
      ];
}
