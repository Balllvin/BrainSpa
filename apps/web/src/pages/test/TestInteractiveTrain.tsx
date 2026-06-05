import { useEffect, useState } from "react";

import {
  fetchPolicyTrainJob,
  policyTrainStreamUrl,
  runPolicyEval,
  startPolicyTrain,
  type PolicyEvalResult,
  type PolicyTrainJob,
} from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestShell } from "./TestShell";

export function TestInteractiveTrain({ modelKey }: { modelKey: string }) {
  const [job, setJob] = useState<PolicyTrainJob | null>(null);
  const [evalResult, setEvalResult] = useState<PolicyEvalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState(100);
  const [backend, setBackend] = useState<"dqn" | "sb3">("dqn");

  useEffect(() => {
    void fetchPolicyTrainJob().then((response) => {
      if (response.job) {
        setJob(response.job);
      }
    });
  }, []);

  useEffect(() => {
    if (job?.state !== "running") {
      return;
    }
    const source = new EventSource(policyTrainStreamUrl());
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { job?: PolicyTrainJob };
        if (payload.job) {
          setJob(payload.job);
        }
      } catch {
        /* ignore malformed */
      }
    };
    return () => source.close();
  }, [job?.state]);

  async function handleTrain() {
    setBusy(true);
    setError(null);
    const response = await startPolicyTrain(episodes, backend);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Train failed");
      return;
    }
    setJob(response.data);
  }

  async function handleEval() {
    setBusy(true);
    setError(null);
    const response = await runPolicyEval(100);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Eval failed");
      return;
    }
    setEvalResult(response.data);
  }

  return (
    <TestShell backTo={testModelPath(modelKey)} backLabel="Snake Policy" title="Autonomous train">
      <p className="test-scenario-hint">RL runs at max CPU speed. Datasets fill automatically each episode.</p>
      <div className="snake-controls">
        <label className="field">
          <span>Episodes</span>
          <input
            type="number"
            min={100}
            value={episodes}
            onChange={(event) => setEpisodes(Number(event.target.value) || 100)}
          />
        </label>
        <label className="field">
          <span>Backend</span>
          <select value={backend} onChange={(event) => setBackend(event.target.value as "dqn" | "sb3")}>
            <option value="dqn">DQN (PyTorch, default)</option>
            <option value="sb3">Stable-Baselines3</option>
          </select>
        </label>
        <button className="primary" type="button" disabled={busy || job?.state === "running"} onClick={handleTrain}>
          Start training
        </button>
        <button className="secondary" type="button" disabled={busy} onClick={handleEval}>
          Run 100-episode eval
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {job ? (
        <article className="run-card snake-job-card">
          <span>Job</span>
          <strong>
            {job.state} — episode {job.episode}/{job.episodes_target}
          </strong>
          <p>
            ε {job.epsilon.toFixed(3)} · mean reward {job.mean_reward.toFixed(2)}
            {job.curriculum_stage ? ` · stage ${job.curriculum_stage}` : ""}
            {job.last_outcome ? ` · last ${job.last_outcome}` : ""}
          </p>
        </article>
      ) : null}
      {evalResult ? (
        <article className="run-card">
          <span>Eval</span>
          <strong>{evalResult.passed ? "North star met" : "Still training"}</strong>
          <p>
            Apples {evalResult.mean_apples.toFixed(1)} · length {evalResult.mean_length.toFixed(1)} · full board{" "}
            {evalResult.full_board_count}/{evalResult.episodes} · streak {evalResult.consecutive_full_board_max}/10
          </p>
        </article>
      ) : null}
    </TestShell>
  );
}