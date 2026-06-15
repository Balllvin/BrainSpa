interface Series {
  label: string;
  color?: string;
  points: { x: number; y: number }[];
}

/** A tiny dependency-free SVG line chart in tactical telemetry style. */
export function MetricChart({
  series,
  height = 220,
  yLabel,
  xLabel = "step",
}: {
  series: Series[];
  height?: number;
  yLabel?: string;
  xLabel?: string;
}) {
  const width = 640;
  const pad = { top: 14, right: 16, bottom: 28, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const all = series.flatMap((s) => s.points);
  if (all.length === 0) {
    return <div className="metric-chart-empty">No metrics yet.</div>;
  }

  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const sx = (x: number) => pad.left + ((x - xMin) / xSpan) * plotW;
  const sy = (y: number) => pad.top + plotH - ((y - yMin) / ySpan) * plotH;

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * ySpan);
  const palette = ["var(--accent)", "#f0a500", "#5ad1c8"];

  return (
    <svg className="metric-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={yLabel ?? "metric chart"}>
      {gridYs.map((gy, i) => (
        <g key={i}>
          <line x1={pad.left} y1={sy(gy)} x2={width - pad.right} y2={sy(gy)} className="metric-chart-grid" />
          <text x={pad.left - 6} y={sy(gy) + 3} className="metric-chart-axis" textAnchor="end">
            {formatTick(gy)}
          </text>
        </g>
      ))}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} className="metric-chart-axis-line" />
      <line x1={pad.left} y1={pad.top + plotH} x2={width - pad.right} y2={pad.top + plotH} className="metric-chart-axis-line" />
      {series.map((s, idx) => {
        const color = s.color ?? palette[idx % palette.length];
        const path = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
        return <path key={s.label} d={path} fill="none" stroke={color} strokeWidth={1.6} />;
      })}
      <text x={pad.left} y={height - 6} className="metric-chart-axis">
        {formatTick(xMin)}
      </text>
      <text x={width - pad.right} y={height - 6} className="metric-chart-axis" textAnchor="end">
        {xLabel} {formatTick(xMax)}
      </text>
      {yLabel ? (
        <text x={6} y={pad.top + 4} className="metric-chart-axis">
          {yLabel}
        </text>
      ) : null}
      {series.length > 1 ? (
        <g>
          {series.map((s, idx) => (
            <text key={s.label} x={width - pad.right - 4} y={pad.top + 12 + idx * 14} className="metric-chart-axis" textAnchor="end" fill={s.color ?? palette[idx % palette.length]}>
              {s.label}
            </text>
          ))}
        </g>
      ) : null}
    </svg>
  );
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
