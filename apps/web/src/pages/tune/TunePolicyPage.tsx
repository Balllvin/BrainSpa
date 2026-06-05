import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchTuneModelStatus } from "@/lib/backend";
import { fetchPolicyEvalLatest, runPolicyEval, startPolicyTrain } from "@/lib/snakeBackend";
import { testScenarioPath } from "@/lib/testRoutes";
import { tuneModelPath } from "@/lib/tuneRoutes";
import type { TuneModelStatus } from "@/lib/types";

import { SnakeBar, SnakeBarBtn, SnakeBarGroup, SnakeTelemetry } from "../test/snake/SnakeBar";
import { SnakeShell } from "../test/snake/SnakeShell";

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
    <SnakeShell backTo={tuneModelPath(modelSlug)}>
      {status ? (
        <SnakeTelemetry>
          {status.policy_state ?? status.adapter_state} · {status.dataset_row_count} rows
        </SnakeTelemetry>
      ) : null}
      <SnakeBar>
        <SnakeBarGroup>
          <SnakeBarBtn disabled={busy} onClick={() => void train()} title="Headless train">
            ▶
          </SnakeBarBtn>
          <SnakeBarBtn disabled={busy} onClick={() => void evaluate()} title="Eval">
            ✓
          </SnakeBarBtn>
        </SnakeBarGroup>
        <SnakeBarGroup>
          <Link className="snake-bar-btn" to={testScenarioPath("snake", "autonomous-train")} title="Live lab">
            ◫
          </Link>
        </SnakeBarGroup>
      </SnakeBar>
    </SnakeShell>
  );
}