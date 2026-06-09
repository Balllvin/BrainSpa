import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchArchivedSnakeSessions,
  fetchCoachDiff,
  fetchCoachStep,
  type ArchivedSnakeSession,
  type CoachDiff,
  type SnakeWorldState,
} from "@/lib/snakeBackend";
import { testModelPath, testScenarioPath } from "@/lib/testRoutes";

import { TestSnakeCanvas } from "./TestSnakeCanvas";
import { SnakeBar, SnakeBarBtn, SnakeBarGroup, SnakeTelemetry } from "./snake/SnakeBar";
import { archivedSessionLabel, SnakePlaceholderBoard } from "./snake/SnakeTestUtils";
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
      if (response.ok && response.data?.world_state) {
        setReplayWorld(response.data.world_state as SnakeWorldState);
      }
    });
  }, [selectedId, step]);

  const total = diff?.total_steps ?? 0;

  return (
    <SnakeShell backTo={testModelPath(modelKey)}>
      {!sessions.length ? (
        <>
          <p className="snake-empty">
            No saved games yet.{" "}
            <Link to={testScenarioPath(modelKey, "human-play")}>Play a round</Link> first — it saves here for
            replay.
          </p>
          <div className="snake-focus">
            <SnakePlaceholderBoard />
          </div>
        </>
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
                aria-label="Saved game"
              >
                {sessions.map((item) => (
                  <option key={item.session_id} value={item.session_id}>
                    {archivedSessionLabel(item)}
                  </option>
                ))}
              </select>
            </SnakeBarGroup>
            <SnakeBarGroup>
              <SnakeBarBtn disabled={step <= 0} onClick={() => setStep((s) => s - 1)}>
                Prev
              </SnakeBarBtn>
              <SnakeBarBtn disabled={total > 0 && step >= total - 1} onClick={() => setStep((s) => s + 1)}>
                Next
              </SnakeBarBtn>
            </SnakeBarGroup>
            <SnakeTelemetry>
              {diff?.found
                ? `Step ${step + 1}/${total} · you ${String(diff.human_action)} · policy ${String(diff.policy_action)}`
                : (diff?.message ?? "Loading replay…")}
            </SnakeTelemetry>
          </SnakeBar>
          <div className="snake-focus">
            {replayWorld ? (
              <TestSnakeCanvas
                world={replayWorld}
                highlight={diff?.head ?? null}
                policyAction={diff?.found && diff.step === step ? diff.policy_action : null}
              />
            ) : (
              <SnakePlaceholderBoard />
            )}
          </div>
        </>
      )}
    </SnakeShell>
  );
}
