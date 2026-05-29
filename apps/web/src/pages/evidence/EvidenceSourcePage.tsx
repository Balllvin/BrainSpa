import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchEvidenceSourceDetail, startEvidenceIngest } from "@/lib/backend";
import {
  BELIEVER_MODEL_SLUG,
  canonicalSourceSlug,
  evidenceHomePath,
  evidenceReviewPath,
  isBelieverModelSlug,
  sourceKeyFromSlug,
} from "@/lib/evidenceRoutes";
import type { EvidenceSourceDetail } from "@/lib/types";

import { EvidenceShell } from "./EvidenceShell";

export function EvidenceSourcePage() {
  const { slug = "" } = useParams();
  const sourceKey = sourceKeyFromSlug(slug);
  const canonicalSlug = canonicalSourceSlug(slug);
  const reviewSlug = isBelieverModelSlug(canonicalSlug) ? BELIEVER_MODEL_SLUG : canonicalSlug;

  const [detail, setDetail] = useState<EvidenceSourceDetail | null>(null);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<number | null>(null);

  useEffect(() => {
    void fetchEvidenceSourceDetail(sourceKey).then((response) => {
      if (!response.ok || !response.detail) {
        setError(response.error ?? "Source not found.");
        return;
      }
      setDetail(response.detail);
      setFocus(response.detail.ingest_focus ?? response.detail.behavior_focus);
    });
  }, [sourceKey]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setLastAdded(null);
    const response = await startEvidenceIngest(sourceKey, focus.trim() || undefined);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Ingest failed.");
      return;
    }
    setLastAdded(response.data.claims_added);
    const refreshed = await fetchEvidenceSourceDetail(sourceKey);
    if (refreshed.ok && refreshed.detail) {
      setDetail(refreshed.detail);
      if (response.data.ingest_focus) {
        setFocus(response.data.ingest_focus);
      }
    }
  }

  const title = detail?.source.label ?? "Source";
  const feedsBeliever =
    Boolean(
      detail?.source.feeds_models?.includes("persona_small") ||
        detail?.source.feeds_models?.includes("believer"),
    ) || isBelieverModelSlug(canonicalSlug);

  return (
    <EvidenceShell backTo={evidenceHomePath()} backLabel="Evidence" title={title}>
      {detail ? (
        <>
          {feedsBeliever ? (
            <p className="evidence-believer-badge evidence-believer-badge--inline">
              Feeds Believer training set
            </p>
          ) : null}
          <section className="evidence-ingest-plan">
            <h2 className="evidence-ingest-plan-title">This pass will mine for</h2>
            <p className="evidence-focus">{focus.trim() || detail.behavior_focus}</p>
            <p className="evidence-provenance">{detail.source.provenance}</p>
          </section>
          <form className="evidence-form" onSubmit={onSubmit}>
            <label className="evidence-field">
              <span>Adjust focus (optional)</span>
              <textarea
                name="focus"
                rows={3}
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder="Blunt faith voice grounded in real sources—not generic assistant tone."
              />
            </label>
            <button className="evidence-primary" disabled={busy} type="submit">
              {busy ? "Mining…" : detail.last_ingest_at ? "Refresh from web/X" : "Mine source"}
            </button>
          </form>
          {error ? <p className="evidence-error">{error}</p> : null}
          {lastAdded !== null ? (
            <p className="evidence-result">
              Added {lastAdded} pending claims.{" "}
              <Link to={evidenceReviewPath(reviewSlug, "pending")}>Review new claims →</Link>
            </p>
          ) : null}
          {!lastAdded && detail.claims.length ? (
            <p className="evidence-next">
              <Link to={evidenceReviewPath(reviewSlug, "pending")}>
                Review {detail.claims.filter((c) => c.status === "pending").length || detail.claims.length}{" "}
                claims →
              </Link>
            </p>
          ) : null}
        </>
      ) : error ? (
        <p className="evidence-error">{error}</p>
      ) : (
        <p className="evidence-empty">Loading…</p>
      )}
    </EvidenceShell>
  );
}
