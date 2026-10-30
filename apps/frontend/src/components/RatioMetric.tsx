import type { Ratio } from "../types/mission";

export function RatioMetric({
  label,
  ratio,
}: {
  label: string;
  ratio: Ratio | undefined;
}) {
  return (
    <div className="ratio-metric">
      <span>{label}</span>
      <strong>
        {ratio && ratio.denominator
          ? `${((ratio.numerator / ratio.denominator) * 100).toFixed(1)}%`
          : "Unavailable"}
      </strong>
      <small>
        {ratio ? `${ratio.numerator} / ${ratio.denominator}` : "No measurement"}
      </small>
      {ratio && ratio.denominator > 0 && (
        <div className="metric-track">
          <div
            style={{ width: `${(ratio.numerator / ratio.denominator) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
