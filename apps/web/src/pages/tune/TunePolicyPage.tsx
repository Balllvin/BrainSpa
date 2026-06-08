import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchTuneModelStatus } from "@/lib/backend";
import {
  fetchPolicyEvalLatest,
  fetchPolicyPerformance,
  fetchPolicyTrainJob,
  runPolicyEval,
  startPolicyTrain,
  type PolicyEvalResult,
  type PolicyPerformance,
  type PolicyTrainJob,
} from "@/lib/snakeBackend";
import { testScenarioPath } from "@/lib/testRoutes";
import { tuneModelPath } from "@/lib/tuneRoutes";
import type { TuneModelStatus } from "@/lib/types";

import { SnakeBar, SnakeBarBtn, SnakeBarGroup, SnakeBarSegment } from "../test/snake/SnakeBar";
import { SnakeShell } from "../test/snake/SnakeShell";

import { TunePolicyDashboard } from "./TunePolicyDashboard";

async function loadPolicyMetrics() {
  const [perf, evalLatest, trainJob] = await Promise.all([
    fetchPolicyPerformance(),
    fetchPolicyEvalLatest(),
    fetchPolicyTrainJob(),
  ]);
  return {
    perf: perf.ok ? perf.data : null,
    evalLatest: evalLatest.ok ? evalLatest.data : null,
    trainJob: trainJob.ok ? trainJob.job : null,
  };
}

export function TunePolicyPage({ modelSlug }: { modelSlug: string }) {
  const [status, setStatus] = useState<TuneModelStatus | null>(null);
  const [perf, setPerf] = useState<PolicyPerformance | null>(null);
  const [evalLatest, setEvalLatest] = useState<PolicyEvalResult | null>(null);
  const [trainJob, setTrainJob] = useState<PolicyTrainJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [backend, setBackend] = useState<"dqn" | "sb3">("dqn");

  const refreshMetrics = useCallback(async () => {
    const metrics = await loadPolicyMetrics();
    setPerf(metrics.perf);
    setEvalLatest(metrics.evalLatest);
    setTrainJob(metrics.trainJob);
  }, []);

  useEffect(() => {
    void fetchTuneModelStatus(modelSlug).then((response) => {
      if (response.ok && response.status) {
        setStatus(response.status);
      }
    });
    void refreshMetrics();
    const timer = window.setInterval(() => void refreshMetrics(), 4000);
    return () => window.clearInterval(timer);
  }, [modelSlug, refreshMetrics]);

  async function train() {
    setBusy(true);
    setActionNote(null);
    const result = await startPolicyTrain(100, backend);
    setBusy(false);
    if (!result.ok) {
      setActionNote(result.error ?? "Could not start training.");
      return;
    }
    if (result.data?.error) {
      setActionNote(result.data.error);
    } else if (result.data?.state === "running") {
      setActionNote("Headless training started.");
    }
    const refreshed = await fetchTuneModelStatus(modelSlug);
    if (refreshed.ok && refreshed.status) {
      setStatus(refreshed.status);
    }
    await refreshMetrics();
  }

  async function evaluate() {
    setBusy(true);
    setActionNote("Running 100-game check…");
    const result = await runPolicyEval(100);
    setBusy(false);
    if (!result.ok) {
      setActionNote(result.error ?? "Eval failed.");
      return;
    }
    setActionNote("Eval finished.");
    await refreshMetrics();
    const refreshed = await fetchTuneModelStatus(modelSlug);
    if (refreshed.ok && refreshed.status) {
      setStatus(refreshed.status);
    }
  }

  return (
    <SnakeShell backTo={tuneModelPath(modelSlug)}>
      <TunePolicyDashboard perf={perf} evalLatest={evalLatest} trainJob={trainJob} />
      {status ? (
        <p className="snake-telemetry">
          {status.policy_state ?? status.adapter_state}
          {perf?.updated_at ? ` · updated ${new Date(perf.updated_at).toLocaleString()}` : ""}
        </p>
      ) : null}
      {actionNote ? <p className="tune-policy-action-note">{actionNote}</p> : null}
      <SnakeBar>
        <SnakeBarGroup>
          <SnakeBarSegment
            value={backend}
            options={[
              { value: "dqn", label: "DQN" },
              { value: "sb3", label: "SB3" },
            ]}
            onChange={setBackend}
            disabled={busy}
          />
        </SnakeBarGroup>
        <SnakeBarGroup>
          <SnakeBarBtn disabled={busy} onClick={() => void train()}>
            Headless train
          </SnakeBarBtn>
          <SnakeBarBtn disabled={busy} onClick={() => void evaluate()}>
            Run check
          </SnakeBarBtn>
        </SnakeBarGroup>
        <SnakeBarGroup>
          <Link className="snake-bar-btn" to={testScenarioPath("snake", "autonomous-train")}>
            Live lab
          </Link>
        </SnakeBarGroup>
      </SnakeBar>
    </SnakeShell>
  );
}
