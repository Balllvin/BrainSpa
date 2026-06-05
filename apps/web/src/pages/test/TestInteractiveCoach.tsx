import { useEffect, useState } from "react";

import {
  fetchArchivedSnakeSessions,
  fetchCoachDiff,
  fetchCoachStep,
  type ArchivedSnakeSession,
  type CoachDiff,
  type SnakeWorldState,
} from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestSnakeCanvas } from "./TestSnakeCanvas";
import { SnakeBar, SnakeBarBtn, SnakeBarGroup, SnakeTelemetry } from "./snake/SnakeBar";
import { SnakeShell } from "./snake/SnakeShell";

export function TestInteractiveCoach({ modelKey }: { modelKey: string }) {
  const [sessions, setSessions] = useState<ArchivedSnakeSession[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [step, setStep] = useState(0);
  const [diff, setDiff] = useState<CoachDiff | null>(null);
  const [replayWorld, setReplayWorld] = useState<SnakeWorldState | null>(null);

  useEffect(() => {
    void fetchArchivedSnakeSessions().then((response) => {
      if (response.ok && response.sessions.length) {
        setSessions(response.sessions);
        setSelectedId(response.sessions[0].session_id);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    void fetchCoachDiff(selectedId, step).then((response) => {
      if (response.ok && response.diff) {
        setDiff(response.diff);
      }
    });
    void fetchCoachStep(selectedId, step).then((response) => {
      if (response.ok && response.data?.transition) {
        const head = response.data.transition.head as [number, number] | undefined;
        if (head) {
          setReplayWorld({
            grid_size: 10,
            snake: [head],
            direction: "up",
            apple: [5, 5],
            score: 0,
            steps: step,
            length: 1,
            coverage: 0.01,
            done: false,
            outcome: "in_progress",
          });
        }
      }
    });
  }, [selectedId, step]);

  const total = diff?.total_steps ?? 0;

  return (
    <SnakeShell backTo={testModelPath(modelKey)}>
      {!sessions.length ? (
        <p className="snake-wait">Play first — session saves here.</p>
      ) : (
        <>
          <SnakeBar>
            <SnakeBarGroup>
              <select
                className="snake-bar-select"
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setStep(0);
                }}
                aria-label="Session"
              >
                {sessions.map((item) => (
                  <option key={item.session_id} value={item.session_id}>
                    {item.scenario_key} / {item.steps}
                  </option>
                ))}
              </select>
            </SnakeBarGroup>
            <SnakeBarGroup>
              <SnakeBarBtn disabled={step <= 0} onClick={() => setStep((s) => s - 1)} title="Previous">
                ←
              </SnakeBarBtn>
              <SnakeBarBtn
                disabled={total > 0 && step >= total - 1}
                onClick={() => setStep((s) => s + 1)}
                title="Next"
              >
                →
              </SnakeBarBtn>
            </SnakeBarGroup>
          </SnakeBar>
          {diff?.found ? (
            <SnakeTelemetry>
              {step + 1}/{total} · you {String(diff.human_action)} · policy {String(diff.policy_action)}
            </SnakeTelemetry>
          ) : (
            <SnakeTelemetry>{diff?.message ?? "···"}</SnakeTelemetry>
          )}
          <div className="snake-focus">
            {replayWorld ? (
              <TestSnakeCanvas world={replayWorld} highlight={diff?.head ?? null} />
            ) : (
              <p className="snake-wait">···</p>
            )}
          </div>
        </>
      )}
    </SnakeShell>
  );
}