import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchSnakeLab,
  runPolicyEval,
  snakeLabStreamUrl,
  startSnakeLab,
  stopSnakeLab,
  type PolicyEvalResult,
  type SnakeLabFrame,
  type SnakeLabPace,
} from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestSnakeCanvas } from "./TestSnakeCanvas";
import { SnakeBar, SnakeBarBtn, SnakeBarGroup, SnakeBarSegment, SnakeTelemetry } from "./snake/SnakeBar";
import { SnakeShell } from "./snake/SnakeShell";

const SLOT_OPTIONS = [4, 5, 6] as const;

export function TestInteractiveTrain({ modelKey }: { modelKey: string }) {
  const [lab, setLab] = useState<SnakeLabFrame | null>(null);
  const [evalResult, setEvalResult] = useState<PolicyEvalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<number>(6);
  const [pace, setPace] = useState<SnakeLabPace>("train");
  const streamRef = useRef<EventSource | null>(null);

  const closeStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
  }, []);

  useEffect(() => {
    void fetchSnakeLab().then((response) => {
      if (response.ok && response.lab) {
        setLab(response.lab);
      }
    });
    return () => closeStream();
  }, [closeStream]);

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

  async function handleRun() {
    setBusy(true);
    closeStream();
    const response = await startSnakeLab(slots, 200, pace);
    setBusy(false);
    if (!response.ok || !response.data?.ok) {
      return;
    }
    setLab(response.data.lab);
    attachLabStream();
  }

  async function handleStop() {
    setBusy(true);
    closeStream();
    await stopSnakeLab();
    const refreshed = await fetchSnakeLab();
    if (refreshed.ok && refreshed.lab) {
      setLab(refreshed.lab);
    }
    setBusy(false);
  }

  async function handleEval() {
    setBusy(true);
    const response = await runPolicyEval(100);
    setBusy(false);
    if (response.ok && response.data) {
      setEvalResult(response.data);
    }
  }

  const running = lab?.running ?? false;

  return (
    <SnakeShell backTo={testModelPath(modelKey)}>
      <SnakeBar>
        <SnakeBarGroup>
          <SnakeBarBtn disabled={busy || running} onClick={() => void handleRun()} title="Run">
            ▶
          </SnakeBarBtn>
          <SnakeBarBtn disabled={busy || !running} onClick={() => void handleStop()} title="Stop">
            ■
          </SnakeBarBtn>
        </SnakeBarGroup>
        <SnakeBarGroup>
          <SnakeBarSegment
            value={slots}
            options={SLOT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
            onChange={setSlots}
            disabled={running}
          />
        </SnakeBarGroup>
        <SnakeBarGroup>
          <SnakeBarSegment
            value={pace}
            options={[
              { value: "human", label: "I", title: "Human pace" },
              { value: "watch", label: "II", title: "Watch" },
              { value: "train", label: "III", title: "Train" },
            ]}
            onChange={setPace}
            disabled={running}
          />
        </SnakeBarGroup>
        <SnakeBarGroup>
          <SnakeBarBtn disabled={busy} onClick={() => void handleEval()} title="Eval 100">
            ✓
          </SnakeBarBtn>
        </SnakeBarGroup>
      </SnakeBar>

      {lab ? (
        <SnakeTelemetry>
          {running ? "●" : "○"} {lab.episode}/{lab.episodes_target} · ε{lab.epsilon} · {lab.mean_reward.toFixed(1)}
          {evalResult ? ` · ${evalResult.passed ? "PASS" : "—"}` : ""}
        </SnakeTelemetry>
      ) : null}

      {lab && lab.slots.length ? (
        <div className={`snake-lab-grid snake-lab-grid--${lab.slot_count}`}>
          {lab.slots.map((slot) => (
            <TestSnakeCanvas key={slot.index} world={slot.world_state} compact cellSize={16} />
          ))}
        </div>
      ) : (
        <p className="snake-wait">▶</p>
      )}
    </SnakeShell>
  );
}