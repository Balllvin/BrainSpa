import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchTuneModelStatus } from "@/lib/backend";
import { fetchPolicyEvalLatest, runPolicyEval, startPolicyTrain } from "@/lib/snakeBackend";
import { testScenarioPath } from "@/lib/testRoutes";
import { tuneModelPath } from "@/lib/tuneRoutes";
import type { TuneModelStatus } from "@/lib/types";

import { TestShell } from "../test/TestShell";

export function TunePolicyPage({ modelSlug }: { modelSlug: string }) {
  const [status, setStatus] = useState<TuneModelStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchTuneModelStatus(modelSlug).then((response) => {
      if (response.ok && response.status) {
        setStatus(response.status);
      }
    });
  }, [modelSlug]);

  async function train() {
    setBusy(true);
    await startPolicyTrain(100);
    setBusy(false);
    const refreshed = await fetchTuneModelStatus(modelSlug);
    if (refreshed.ok && refreshed.status) {
      setStatus(refreshed.status);
    }
  }

  async function evaluate() {
    setBusy(true);
    await runPolicyEval(100);
    await fetchPolicyEvalLatest();
    setBusy(false);
    const refreshed = await fetchTuneModelStatus(modelSlug);
    if (refreshed.ok && refreshed.status) {
      setStatus(refreshed.status);
    }
  }

  return (
    <TestShell backTo={tuneModelPath(modelSlug)} backLabel="Tune" title="Snake policy">
      {status ? (
        <article className="run-card">
          <span>Checkpoint</span>
          <strong>{status.policy_state ?? status.adapter_state}</strong>
          <p>{status.dataset_row_count} transitions logged</p>
        </article>
      ) : null}
      <div className="btn-row">
        <button className="primary" type="button" disabled={busy} onClick={train}>
          Train policy (100+ episodes)
        </button>
        <button className="secondary" type="button" disabled={busy} onClick={evaluate}>
          Eval 100 episodes
        </button>
        <Link className="secondary" to={testScenarioPath("snake", "autonomous-watch")}>
          Watch in Test
        </Link>
      </div>
    </TestShell>
  );
}