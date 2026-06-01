import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { fetchTuneModelStatus } from "@/lib/backend";
import { testModelPath } from "@/lib/testRoutes";
import {
  canonicalModelSlug,
  tuneBuildPath,
  tuneHomePath,
  tuneModelPath,
  tuneStatusPath,
  tuneTryPath,
} from "@/lib/tuneRoutes";
import type { TuneModelStatus } from "@/lib/types";

import { adapterStatusLabel } from "./tuneDisplay";
import { TuneShell } from "./TuneShell";
import { TuneStaleBanner } from "./TuneStaleBanner";

type HubCard = {
  key: string;
  name: string;
  hint: string;
  path: (slug: string) => string;
};

const HUB_CARDS: HubCard[] = [
  {
    key: "build",
    name: "Build",
    hint: "Dry-run, then train the adapter",
    path: (slug) => tuneBuildPath(slug),
  },
  {
    key: "status",
    name: "Status & acceptance",
    hint: "Last build and 10-question check",
    path: (slug) => tuneStatusPath(slug),
  },
  {
    key: "try",
    name: "Quick try",
    hint: "One prompt smoke test",
    path: (slug) => tuneTryPath(slug),
  },
  {
    key: "test",
    name: "Test environments",
    hint: "Counsel, advice, review, daily note",
    path: (slug) => testModelPath(slug),
  },
];

export function TuneModelPage() {
  const { modelSlug = "" } = useParams();
  const canonicalSlug = canonicalModelSlug(modelSlug);
  const [status, setStatus] = useState<TuneModelStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchTuneModelStatus(canonicalSlug).then((response) => {
      if (!response.ok || !response.status) {
        setError(response.error ?? "Could not load model.");
        setReady(true);
        return;
      }
      setStatus(response.status);
      setReady(true);
    });
  }, [canonicalSlug]);

  if (modelSlug !== canonicalSlug) {
    return <Navigate replace to={tuneModelPath(canonicalSlug)} />;
  }

  const datasetSlug = status?.dataset_key === "starter_seed" ? "starter" : status?.dataset_key ?? "starter";

  return (
    <TuneShell
      backTo={tuneHomePath()}
      backLabel="Tune"
      title={status?.display_name ?? (canonicalSlug === "starter" ? "Starter" : canonicalSlug)}
    >
      {!ready ? <p className="tune-empty">Loading…</p> : null}
      {ready && error ? <p className="tune-error">{error}</p> : null}
      {ready && status ? (
        <>
          {status.stale && status.stale_reason ? (
            <TuneStaleBanner message={status.stale_reason} datasetSlug={datasetSlug} />
          ) : null}
          <div className="tune-hub-summary">
            <span className={`tune-status-badge tune-status-badge--${status.adapter_state}`}>
              {adapterStatusLabel(status.adapter_state)}
            </span>
            <span className="tune-picker-meta tune-picker-meta--muted">
              {status.dataset_row_count} training rows
            </span>
          </div>
          <div className="tune-picker-grid tune-picker-grid--hub">
            {HUB_CARDS.map((card) => (
              <Link
                key={card.key}
                className={`tune-picker-card${card.key === "build" ? " tune-picker-card--primary" : ""}`}
                to={card.path(canonicalSlug)}
              >
                <strong>{card.name}</strong>
                <span className="tune-action-hint">{card.hint}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </TuneShell>
  );
}
