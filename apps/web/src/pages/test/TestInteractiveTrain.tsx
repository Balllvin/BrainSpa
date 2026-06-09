import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchSnakeLab,
  idleLabSlots,
  SNAKE_LAB_BOARD_COUNT,
  snakeLabStreamUrl,
  setSnakeLabEpisodes,
  setSnakeLabSpeed,
  startSnakeLab,
  stopSnakeLab,
  type SnakeLabFrame,
  type SnakeLabRuns,
  type SnakeLabSlot,
  type SnakeLabSpeed,
} from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestSnakeCanvas } from "./TestSnakeCanvas";
import { SnakeLabHeaderControls } from "./snake/SnakeLabHeaderControls";
import { SnakeLabToolbar } from "./snake/SnakeLabToolbar";
import { labTrainingStats } from "./snake/SnakeTestUtils";
import { SnakeShell } from "./snake/SnakeShell";

export function TestInteractiveTrain({ modelKey }: { modelKey: string }) {
  const [lab, setLab] = useState<SnakeLabFrame | null>(null);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState<SnakeLabSpeed>(1);
  const [runs, setRuns] = useState<SnakeLabRuns>(100);
  const streamRef = useRef<EventSource | null>(null);

  const closeStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
  }, []);

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

  useEffect(() => {
    void fetchSnakeLab().then((response) => {
      if (response.ok && response.lab) {
        setLab(response.lab);
        if (response.lab.speed_multiplier) {
          setSpeed(normalizeLabSpeed(response.lab.speed_multiplier));
        }
        if (response.lab.episodes_target) {
          setRuns(normalizeLabRuns(response.lab.episodes_target));
        }
        if (response.lab.running) {
          attachLabStream();
        }
      }
    });
    return () => closeStream();
  }, [attachLabStream, closeStream]);

  async function handleRun() {
    setBusy(true);
    closeStream();
    const response = await startSnakeLab(SNAKE_LAB_BOARD_COUNT, runs, speed);
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

  const running = lab?.running ?? false;
  const slots: SnakeLabSlot[] =
    lab?.slots?.length === SNAKE_LAB_BOARD_COUNT ? lab.slots : idleLabSlots();
  const stats = labTrainingStats(lab, slots);

  async function handleSpeedChange(next: SnakeLabSpeed) {
    setSpeed(next);
    if (!running) {
      return;
    }
    const response = await setSnakeLabSpeed(next);
    if (response.ok && response.data?.lab) {
      setLab(response.data.lab);
    }
  }

  async function handleRunsChange(next: SnakeLabRuns) {
    setRuns(next);
    const response = await setSnakeLabEpisodes(next);
    if (response.ok && response.data?.lab) {
      setLab(response.data.lab);
    }
  }

  return (
    <SnakeShell
      variant="lab"
      backTo={testModelPath(modelKey)}
      headerAside={
        <SnakeLabHeaderControls
          speed={speed}
          runs={runs}
          onSpeedChange={(next) => void handleSpeedChange(next)}
          onRunsChange={(next) => void handleRunsChange(next)}
        />
      }
    >
      <SnakeLabToolbar
        stats={stats}
        running={running}
        busy={busy}
        episode={lab?.episode ?? 0}
        target={lab?.episodes_target ?? runs}
        draining={lab?.draining}
        onToggle={() => void (running ? handleStop() : handleRun())}
      />

      <div className="snake-lab-grid snake-lab-grid--6">
        {slots.map((slot) => (
          <div key={slot.index} className="snake-lab-slot">
            <TestSnakeCanvas world={slot.world_state} compact cellSize={18} />
          </div>
        ))}
      </div>
    </SnakeShell>
  );
}

function normalizeLabSpeed(value: number): SnakeLabSpeed {
  const options: SnakeLabSpeed[] = [1, 2, 4, 8, 16];
  return options.reduce((best, option) =>
    Math.abs(option - value) < Math.abs(best - value) ? option : best,
  );
}

function normalizeLabRuns(value: number): SnakeLabRuns {
  const options: SnakeLabRuns[] = [10, 100, 200, 500, 1000];
  return options.reduce((best, option) =>
    Math.abs(option - value) < Math.abs(best - value) ? option : best,
  );
}
