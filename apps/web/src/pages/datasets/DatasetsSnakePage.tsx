import { useEffect, useState } from "react";

import { fetchSnakeDatasetSummary } from "@/lib/snakeBackend";
import { datasetsHomePath } from "@/lib/datasetsRoutes";

import { DatasetsShell } from "./DatasetsShell";

export function DatasetsSnakePage() {
  const [summary, setSummary] = useState<{
    trajectory_count: number;
    transition_count: number;
    trajectories_path: string;
    transitions_path: string;
  } | null>(null);

  useEffect(() => {
    void fetchSnakeDatasetSummary().then((response) => {
      if (response.ok && response.summary) {
        setSummary(response.summary);
      }
    });
  }, []);

  return (
    <DatasetsShell backTo={datasetsHomePath()} backLabel="Datasets" title="Snake rollout">
      <p className="test-scenario-hint">Fed by autonomous training — no Evidence step.</p>
      {summary ? (
        <article className="run-card">
          <span>Logged data</span>
          <strong>
            {summary.transition_count} transitions · {summary.trajectory_count} episodes
          </strong>
          <code>{summary.transitions_path}</code>
        </article>
      ) : (
        <p className="test-empty">No rollouts yet. Run autonomous train in Test.</p>
      )}
    </DatasetsShell>
  );
}