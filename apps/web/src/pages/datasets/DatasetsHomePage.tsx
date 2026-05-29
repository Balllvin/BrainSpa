import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchBrainSpaOverview } from "@/lib/backend";
import {
  datasetDisplayLabel,
  datasetGeneratePath,
  datasetRowsPath,
  datasetSlugFromKey,
} from "@/lib/datasetsRoutes";
import type { DatasetProfile } from "@/lib/types";

import { DatasetsShell } from "./DatasetsShell";

export function DatasetsHomePage() {
  const [datasets, setDatasets] = useState<DatasetProfile[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void fetchBrainSpaOverview().then((response) => {
      setDatasets(response.overview?.datasets ?? []);
      setReady(true);
    });
  }, []);

  const active = datasets.filter((item) => item.state !== "retired" && item.state !== "archived");

  return (
    <DatasetsShell title="Datasets">
      {!ready ? <p className="datasets-empty">Loading…</p> : null}
      {ready && !active.length ? (
        <p className="datasets-empty">
          No datasets yet. <Link to="/evidence">Approve evidence</Link> first.
        </p>
      ) : null}
      {ready && active.length ? (
        <div
          className={`datasets-picker-grid${active.length === 1 ? " datasets-picker-grid--solo" : ""}`}
        >
          {active.map((dataset) => {
            const slug = datasetSlugFromKey(dataset.key);
            const label = datasetDisplayLabel(dataset.key, dataset.label);
            const summary =
              dataset.row_count > 0
                ? `${dataset.row_count} rows · ${dataset.state}${dataset.warnings.length ? ` · ${dataset.warnings.length} warning(s)` : ""}`
                : `No rows yet · ${dataset.state}`;
            return (
              <article key={dataset.key} className="datasets-picker-card">
                <Link className="datasets-picker-card-main" to={datasetRowsPath(slug)}>
                  <strong>{label}</strong>
                  <span className="datasets-picker-meta">{summary}</span>
                </Link>
                <div className="datasets-picker-actions">
                  <Link to={datasetGeneratePath(slug)}>Generate</Link>
                  <Link to={datasetRowsPath(slug)}>Review rows</Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </DatasetsShell>
  );
}
