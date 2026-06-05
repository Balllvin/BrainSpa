import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchPolicyTrainJob,
  fetchSnakeLab,
  policyTrainStreamUrl,
  runPolicyEval,
  snakeLabStreamUrl,
  startPolicyTrain,
  startSnakeLab,
  stopSnakeLab,
  type PolicyEvalResult,
  type PolicyTrainJob,
  type SnakeLabFrame,
  type SnakeLabPace,
} from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestShell } from "./TestShell";
import { TestSnakeCanvas } from "./TestSnakeCanvas";

const SLOT_OPTIONS = [4, 5, 6] as const;

export function TestInteractiveTrain({ modelKey }: { modelKey: string }) {
  const [lab, setLab] = useState<SnakeLabFrame | null>(null);
  const [job, setJob] = useState<PolicyTrainJob | null>(null);
  const [evalResult, setEvalResult] = useState<PolicyEvalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState(200);
  const [slots, setSlots] = useState<number>(6);
  const [pace, setPace] = useState<SnakeLabPace>("train");
  const [backend, setBackend] = useState<"dqn" | "sb3">("dqn");
  const [showHeadless, setShowHeadless] = useState(false);
  const streamRef = useRef<EventSource | null>(null);

  const closeStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
  }, []);

  useEffect(() => {
    void fetchPolicyTrainJob().then((response) => {
      if (response.job) {
        setJob(response.job);
      }
    });
    void fetchSnakeLab().then((response) => {
      if (response.ok && response.lab) {
        setLab(response.lab);
      }
    });
    return () => closeStream();
  }, [closeStream]);

  useEffect(() => {
    if (job?.state !== "running" || job.phase === "lab") {
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
        /* ignore */
      }
    };
    return () => source.close();
  }, [job?.state, job?.phase]);

  const attachLabStream = useCallback(() => {
    closeStream();
    const source = new EventSource(snakeLabStreamUrl());
    streamRef.current = source;
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type: string; lab?: SnakeLabFrame };
        if (payload.lab) {
          setLab(payload.lab);
        }
        if (payload.type === "done") {
          closeStream();
        }
      } catch {
        /* ignore */
      }
    };
    source.onerror = () => closeStream();
  }, [closeStream]);

  async function handleRunSimulation() {
    setBusy(true);
    setError(null);
    closeStream();
    const response = await startSnakeLab(slots, episodes, pace);
    setBusy(false);
    if (!response.ok || !response.data?.ok) {
      setError(response.error ?? response.data?.message ?? "Could not start lab");
      return;
    }
    setLab(response.data.lab);
    attachLabStream();
  }

  async function handleStopSimulation() {
    setBusy(true);
    closeStream();
    await stopSnakeLab();
    const refreshed = await fetchSnakeLab();
    if (refreshed.ok && refreshed.lab) {
      setLab(refreshed.lab);
    }
    setBusy(false);
  }

  async function handleHeadlessTrain() {
    setBusy(true);
    setError(null);
    const response = await startPolicyTrain(episodes, backend);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Train failed");
      return;
    }
    if (response.data.state === "failed" && response.data.error) {
      setError(response.data.error);
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

  const running = lab?.running ?? false;

  return (
    <TestShell backTo={testModelPath(modelKey)} backLabel="Snake Policy" title="Simulation lab">
      <p className="test-scenario-hint">
        One shared policy, {slots} parallel boards. Train pace updates weights fast; human pace matches play speed.
      </p>

      <div className="snake-lab-controls">
        <button
          className="primary"
          type="button"
          disabled={busy || running}
          onClick={() => void handleRunSimulation()}
        >
          Run simulation
        </button>
        <button className="secondary" type="button" disabled={busy || !running} onClick={() => void handleStopSimulation()}>
          Stop
        </button>
        <label className="field">
          <span>Boards</span>
          <select value={slots} disabled={running} onChange={(e) => setSlots(Number(e.target.value))}>
            {SLOT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Pace</span>
          <select
            value={pace}
            disabled={running}
            onChange={(e) => setPace(e.target.value as SnakeLabPace)}
          >
            <option value="human">Human (~8/s, 1 step)</option>
            <option value="watch">Watch (~15/s)</option>
            <option value="train">Train (max, 5× steps)</option>
          </select>
        </label>
        <label className="field">
          <span>Episodes (shared)</span>
          <input
            type="number"
            min={20}
            value={episodes}
            disabled={running}
            onChange={(e) => setEpisodes(Number(e.target.value) || 200)}
          />
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {lab ? (
        <>
          <article className="run-card snake-job-card">
            <span>Live lab</span>
            <strong>
              {running ? "Training" : "Idle"} — episode {lab.episode}/{lab.episodes_target}
            </strong>
            <p>
              ε {lab.epsilon.toFixed(3)} · mean reward {lab.mean_reward.toFixed(2)} · apples {lab.mean_apples.toFixed(1)}{" "}
              · stage {lab.curriculum_stage}
              {lab.checkpoint_ready ? " · checkpoint on disk" : " · no checkpoint yet"}
            </p>
          </article>
          <div className={`snake-lab-grid snake-lab-grid--${lab.slot_count}`}>
            {lab.slots.map((slot) => (
              <article key={slot.index} className="snake-lab-panel">
                <header className="snake-lab-panel-head">
                  <span>#{slot.index + 1}</span>
                  <span>{slot.profile}</span>
                  <span>{slot.world_state.done ? slot.last_outcome ?? "done" : "live"}</span>
                </header>
                <TestSnakeCanvas world={slot.world_state} compact cellSize={16} />
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="test-empty">Press Run simulation to open parallel training boards.</p>
      )}

      <div className="snake-controls">
        <button className="secondary" type="button" onClick={() => setShowHeadless((v) => !v)}>
          {showHeadless ? "Hide headless train" : "Headless train (background)"}
        </button>
        <button className="secondary" type="button" disabled={busy} onClick={() => void handleEval()}>
          Run 100-episode eval
        </button>
      </div>

      {showHeadless ? (
        <div className="snake-controls">
          <label className="field">
            <span>Backend</span>
            <select value={backend} onChange={(e) => setBackend(e.target.value as "dqn" | "sb3")}>
              <option value="dqn">DQN (PyTorch)</option>
              <option value="sb3">Stable-Baselines3</option>
            </select>
          </label>
          <button
            className="secondary"
            type="button"
            disabled={busy || job?.state === "running" || running}
            onClick={() => void handleHeadlessTrain()}
          >
            Start headless
          </button>
          {job && job.phase !== "lab" ? (
            <p className="test-scenario-hint">
              Headless {job.state} — {job.episode}/{job.episodes_target}
            </p>
          ) : null}
        </div>
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