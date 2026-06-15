import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchEvidenceSources } from "@/lib/backend";
import { evidenceReviewPath, evidenceSourcePath } from "@/lib/evidenceRoutes";
import type { EvidenceSourceSummary } from "@/lib/types";

import { EvidenceShell } from "./EvidenceShell";

export function EvidenceHomePage() {
  const [sources, setSources] = useState<EvidenceSourceSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchEvidenceSources().then((response) => {
      if (!response.ok) {
        setError(response.error ?? "Could not load sources.");
      } else {
        setSources(response.sources);
      }
      setReady(true);
    });
  }, []);

  // The backend already returns the sources to display; there is no `active`
  // flag on EvidenceSourceSummary (filtering on it dropped every source and
  // broke the typecheck). Show what the API returns.
  const active = sources;

  return (
    <EvidenceShell title="Evidence">
      {!ready ? <p className="evidence-empty">Loading…</p> : null}
      {error ? <p className="evidence-error">{error}</p> : null}
      {ready && !error && !active.length ? (
        <p className="evidence-empty">
          No evidence sources yet. Add source ingest when a model behavior needs proof before rows.
        </p>
      ) : null}
      {ready && active.length ? (
        <div className={`evidence-picker-grid${active.length === 1 ? " evidence-picker-grid--solo" : ""}`}>
          {active.map((source) => (
            <article key={source.key} className="evidence-source-card">
              <div className="evidence-source-card-head">
                <strong>{source.label}</strong>
                <span className="evidence-source-kind">{source.kind}</span>
              </div>
              <p className="evidence-source-summary">{source.summary}</p>
              <p className="evidence-source-meta">
                {source.approved_count} approved · {source.pending_count} pending
                {source.weak_count ? ` · ${source.weak_count} weak` : ""}
                {source.rejected_count ? ` · ${source.rejected_count} rejected` : ""}
              </p>
              <div className="evidence-source-actions">
                <Link className="evidence-action" to={evidenceSourcePath(source.key)}>
                  Mine / refresh
                </Link>
                <Link className="evidence-action" to={evidenceReviewPath(source.key, "pending")}>
                  Review
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </EvidenceShell>
  );
}
