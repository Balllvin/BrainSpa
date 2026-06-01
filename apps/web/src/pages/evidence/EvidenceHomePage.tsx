import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { fetchEvidenceModelSummary, fetchEvidenceSources } from "@/lib/backend";
import { datasetGeneratePath } from "@/lib/datasetsRoutes";
import {
  STARTER_MODEL_SLUG,
  evidenceReviewPath,
  evidenceReviewPathWithAdd,
  evidenceSourcePath,
  sourceFeedsStarter,
} from "@/lib/evidenceRoutes";
import type { EvidenceModelSummary, EvidenceSourceSummary } from "@/lib/types";

import { EvidenceShell } from "./EvidenceShell";

export function EvidenceHomePage() {
  const [starter, setStarter] = useState<EvidenceModelSummary | null>(null);
  const [sources, setSources] = useState<EvidenceSourceSummary[]>([]);
  const [otherOpen, setOtherOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetchEvidenceModelSummary(STARTER_MODEL_SLUG),
      fetchEvidenceSources(),
    ]).then(([starterRes, sourcesRes]) => {
      if (!sourcesRes.ok) {
        setError(sourcesRes.error ?? "Could not load sources.");
        setReady(true);
        return;
      }
      setSources(sourcesRes.sources);
      if (starterRes.ok && starterRes.summary) {
        setStarter(starterRes.summary);
      }
      setReady(true);
    });
  }, []);

  const starterSources = useMemo(
    () => sources.filter((source) => sourceFeedsStarter(source.feeds_model_labels ?? [])),
    [sources],
  );
  const otherSources = useMemo(
    () => sources.filter((source) => !sourceFeedsStarter(source.feeds_model_labels ?? [])),
    [sources],
  );

  return (
    <EvidenceShell title="Evidence">
      {!ready ? <p className="evidence-empty">Loading…</p> : null}
      {error ? <p className="evidence-error">{error}</p> : null}

      {ready && starter ? (
        <>
          {starter.ready_for_datasets ? (
            <div className="evidence-ready-banner">
              <strong>
                {starter.approved_count} approved — ready for Datasets
              </strong>
              <p>Generate Starter training rows from approved claims only.</p>
              <Link className="evidence-ready-link" to={datasetGeneratePath(STARTER_MODEL_SLUG)}>
                Generate training rows →
              </Link>
            </div>
          ) : null}

          <article className="evidence-starter-panel">
            <header className="evidence-starter-panel-head">
              <h2 className="evidence-starter-title">Starter evidence</h2>
              <span className="evidence-starter-badge">Feeds Starter training set</span>
            </header>
            <p className="evidence-focus">{starter.behavior_focus}</p>
            <p className="evidence-starter-meta">
              {starter.approved_count} approved · {starter.pending_count} pending
              {starter.weak_count ? ` · ${starter.weak_count} weak` : ""}
              {starter.rejected_count ? ` · ${starter.rejected_count} rejected` : ""}
            </p>
            <p className="evidence-triage-hint">
              Approve = used in Datasets. Weak = saved but not used. Reject = excluded.
            </p>
            <div className="evidence-starter-actions">
              <Link
                className="evidence-primary evidence-primary--link"
                to={evidenceReviewPath(STARTER_MODEL_SLUG, "pending")}
              >
                Review pending
              </Link>
              <Link className="evidence-action" to={evidenceReviewPathWithAdd(STARTER_MODEL_SLUG)}>
                Add claim
              </Link>
            </div>
            {starterSources.length ? (
              <ul className="evidence-linked-sources">
                {starterSources.map((source) => (
                  <li key={source.key}>
                    <span>{source.label}</span>
                    <span className="evidence-source-meta">
                      {source.approved_count} approved · {source.pending_count} pending
                    </span>
                    <Link className="evidence-action" to={evidenceSourcePath(source.key)}>
                      Mine / refresh
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        </>
      ) : null}

      {ready && otherSources.length ? (
        <details
          className="evidence-other-sources"
          open={otherOpen}
          onToggle={(event) => setOtherOpen(event.currentTarget.open)}
        >
          <summary>Other sources ({otherSources.length})</summary>
          <div className="evidence-picker-grid evidence-picker-grid--solo">
            {otherSources.map((source) => (
              <article key={source.key} className="evidence-source-card evidence-source-card--secondary">
                <div className="evidence-source-card-head">
                  <strong>{source.label}</strong>
                  <span className="evidence-source-kind">{source.kind}</span>
                </div>
                <p className="evidence-source-summary">{source.summary}</p>
                <p className="evidence-source-meta">
                  {source.approved_count} approved · {source.pending_count} pending
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
        </details>
      ) : null}
    </EvidenceShell>
  );
}
