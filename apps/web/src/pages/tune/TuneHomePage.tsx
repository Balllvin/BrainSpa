import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchTuneStatus } from "@/lib/backend";
import { datasetDisplayLabel } from "@/lib/datasetsRoutes";
import { tuneModelPath } from "@/lib/tuneRoutes";
import type { TuneModelStatus } from "@/lib/types";

import { tuneStatusBadge } from "./tuneDisplay";
import { TuneShell } from "./TuneShell";

export function TuneHomePage() {
  const [models, setModels] = useState<TuneModelStatus[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchTuneStatus().then((response) => {
      if (!response.ok || !response.data) {
        setError(response.error ?? "Could not load models.");
        setReady(true);
        return;
      }
      setModels(response.data.models);
      setReady(true);
    });
  }, []);

  return (
    <TuneShell title="Tune">
      <Link className="studio-banner" to="/tune/studio">
        <strong>Studio · train anything</strong>
        <span>Train an RL policy (CartPole, GridWorld, Snake) or a tabular classifier/regressor from scratch — live metrics, runs, inference.</span>
      </Link>
      {!ready ? <p className="tune-empty">Loading…</p> : null}
      {ready && error ? <p className="tune-error">{error}</p> : null}
      {ready && !error && !models.length ? (
        <p className="tune-empty">No models in registry. Add one in Settings.</p>
      ) : null}
      {ready && !error && models.length ? (
        <div className={`tune-picker-grid${models.length === 1 ? " tune-picker-grid--solo" : ""}`}>
          {models.map((model) => (
            <Link key={model.model_key} className="tune-picker-card" to={tuneModelPath(model.slug)}>
              <strong>{model.display_name}</strong>
              <span
                className={`tune-status-badge tune-status-badge--${model.model_kind === "policy" ? model.policy_state ?? "missing" : model.adapter_state}`}
              >
                {tuneStatusBadge(model)}
              </span>
              {model.stale && model.stale_reason ? (
                <span className="tune-stale-hint">{model.stale_reason}</span>
              ) : (
                <span className="tune-picker-meta tune-picker-meta--muted">
                  {model.dataset_row_count} rows
                  {model.build_dataset_key
                    ? ` · built on ${datasetDisplayLabel(model.build_dataset_key)}`
                    : " · not built yet"}
                </span>
              )}
            </Link>
          ))}
        </div>
      ) : null}
    </TuneShell>
  );
}
