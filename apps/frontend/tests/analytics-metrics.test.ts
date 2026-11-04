import { expect, it } from "vitest";
import {
  latencyText,
  ratePercent,
  ratioPercent,
  reportSamples,
  validLatency,
} from "../src/features/analytics/metrics";
import type { BenchmarkArtifact } from "../src/types/mission";

it("keeps missing, zero-denominator and invalid ratios unavailable", () => {
  expect(ratioPercent({ numerator: 1, denominator: 5 })).toBe(20);
  expect(ratioPercent({ numerator: 0, denominator: 5 })).toBe(0);
  for (const value of [
    undefined,
    { numerator: 0, denominator: 0 },
    { numerator: 6, denominator: 5 },
    { numerator: -1, denominator: 5 },
    { numerator: 1.5, denominator: 5 },
  ])
    expect(ratioPercent(value)).toBeNull();
});
it("excludes invalid timing and rate samples while preserving measured zero", () => {
  expect(validLatency(0)).toBe(0);
  expect(latencyText(0)).toBe("0.000 ms");
  for (const value of [undefined, -1, Infinity, NaN])
    expect(validLatency(value)).toBeNull();
  expect(ratePercent(1)).toBe(100);
  for (const value of [undefined, -0.1, 1.1, NaN])
    expect(ratePercent(value)).toBeNull();
});
it("keeps policy fixture validation separate from executed task verdicts", () => {
  const report = {
    report_id: "planning-policy",
    data: {
      rows: [
        {
          id: "fixture-policy",
          status: "valid",
          expected_outcome_matched: false,
          latency_ms: 0.4,
        },
      ],
    },
  } as BenchmarkArtifact;
  const [sample] = reportSamples(report);
  expect(sample.method).toBe("Policy fixture · not executed");
  expect(sample.outcome).toBe("valid");
  expect(sample.agreement).toBe(false);
  expect(sample.sourceAvailable).toBeNull();
  expect(reportSamples(undefined)).toEqual([]);
});
