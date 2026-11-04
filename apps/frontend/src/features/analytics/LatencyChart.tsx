import { latencyText, type BenchmarkSample } from "./metrics";

export function LatencyChart({
  rows,
  selected,
  select,
}: {
  rows: BenchmarkSample[];
  selected?: string;
  select: (id: string) => void;
}) {
  const samples = rows.filter((row) => row.latency !== null);
  const maximum = Math.max(1, ...samples.map((row) => row.latency!));
  return (
    <div className="analytics-latency-chart">
      <div className="analytics-chart-caption">
        <span>
          RECORDED SAMPLES{" "}
          <strong>
            {samples.length} / {rows.length}
          </strong>
        </span>
        <span>
          UNIT <strong>milliseconds</strong>
        </span>
      </div>
      {samples.length ? (
        <>
          <svg
            viewBox="0 0 720 260"
            role="img"
            aria-label="Recorded scenario latency in milliseconds"
          >
            <title>Latency samples in report order</title>
            {[0, 0.5, 1].map((fraction) => (
              <g key={fraction}>
                <line
                  x1="65"
                  x2="700"
                  y1={225 - fraction * 190}
                  y2={225 - fraction * 190}
                  className="analytics-chart-grid"
                />
                <text x="52" y={229 - fraction * 190} textAnchor="end">
                  {(maximum * fraction).toFixed(maximum < 2 ? 2 : 0)}
                </text>
              </g>
            ))}
            {samples.map((sample, index) => {
              const lane = 620 / samples.length;
              const height = (sample.latency! / maximum) * 190;
              const x = 75 + lane * index + lane * 0.2;
              return (
                <g key={sample.id}>
                  <rect
                    className={`analytics-chart-bar ${selected === sample.id ? "selected" : ""}`}
                    x={x}
                    y={225 - height}
                    width={lane * 0.6}
                    height={height}
                    rx="3"
                    onMouseEnter={() => select(sample.id)}
                  >
                    <title>
                      {sample.name.replaceAll("_", " ")}:{" "}
                      {latencyText(sample.latency)}
                    </title>
                  </rect>
                  <text x={x + lane * 0.3} y="247" textAnchor="middle">
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </svg>
          <div
            className="analytics-chart-selectors"
            aria-label="Select latency sample"
          >
            {samples.map((sample, index) => (
              <button
                key={sample.id}
                aria-label={`Inspect latency sample ${sample.name}`}
                aria-pressed={selected === sample.id}
                onClick={() => select(sample.id)}
              >
                {String(index + 1).padStart(2, "0")}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="analytics-chart-empty">
          No valid latency samples in this report.
        </div>
      )}
      <p>
        One recorded sample per scenario, in source order. This is not a time
        trend or a pipeline phase breakdown.
      </p>
    </div>
  );
}
