import type { TuneBuildPreview } from "@/lib/types";

import { formatBuiltAt } from "./tuneDisplay";

export function TunePreBuildSummary({ preview }: { preview: TuneBuildPreview }) {
  return (
    <div className="tune-summary-card">
      <strong>Before you build</strong>
      <p className="tune-summary-line">
        {preview.dataset_display_label} — {preview.row_count} rows
      </p>
      <p className="tune-summary-line tune-summary-line--muted">
        Last build: {formatBuiltAt(preview.built_at)}
        {preview.build_rows_used != null ? ` (${preview.build_rows_used} rows used)` : ""}
      </p>
      {preview.stale && preview.stale_reason ? (
        <p className="tune-result-line tune-result-line--warn">{preview.stale_reason}</p>
      ) : null}
      {preview.scenario_breakdown.length ? (
        <ul className="tune-scenario-breakdown">
          {preview.scenario_breakdown.map((item) => (
            <li key={item.key}>
              <span>{formatScenarioLabel(item.label)}</span>
              <span className="tune-picker-meta--muted">{item.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatScenarioLabel(label: string) {
  return label
    .split(" ")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}
