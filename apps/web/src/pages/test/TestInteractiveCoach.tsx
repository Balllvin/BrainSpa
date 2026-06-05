import { useEffect, useState } from "react";

import {
  fetchArchivedSnakeSessions,
  fetchCoachDiff,
  fetchCoachStep,
  type CoachDiff,
  type ArchivedSnakeSession,
} from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestShell } from "./TestShell";
import { TestSnakeCanvas } from "./TestSnakeCanvas";
import type { SnakeWorldState } from "@/lib/snakeBackend";

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

  return (
    <TestShell backTo={testModelPath(modelKey)} backLabel="Snake Policy" title="Coach replay">
      <p className="test-scenario-hint">
        Pick a saved human session. Step through moves; the policy shows where you diverged.
      </p>
      {!sessions.length ? (
        <p className="test-empty">No archived sessions. Play Human play or Human vs AI first.</p>
      ) : (
        <>
          <label className="field">
            <span>Session</span>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {sessions.map((item) => (
                <option key={item.session_id} value={item.session_id}>
                  {item.scenario_key} · {item.steps} steps · {item.outcome ?? "—"}
                </option>
              ))}
            </select>
          </label>
          <div className="snake-controls">
            <button className="secondary" type="button" disabled={step <= 0} onClick={() => setStep((s) => s - 1)}>
              Previous
            </button>
            <span>
              Step {step + 1} / {diff?.total_steps ?? "?"}
            </span>
            <button
              className="secondary"
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={diff?.total_steps != null && step >= diff.total_steps - 1}
            >
              Next
            </button>
          </div>
          {diff?.found ? (
            <article className="run-card snake-coach-card">
              <strong>Wrong at step {(diff.step ?? 0) + 1}</strong>
              <p>
                You chose {String(diff.human_action).toUpperCase()}. Policy wants {String(diff.policy_action).toUpperCase()}.
              </p>
            </article>
          ) : (
            <p className="test-scenario-hint">{diff?.message ?? "Loading diff…"}</p>
          )}
          {replayWorld ? (
            <TestSnakeCanvas
              world={replayWorld}
              highlight={diff?.head ?? null}
              suggestedDirection={diff?.policy_action ?? null}
            />
          ) : null}
        </>
      )}
    </TestShell>
  );
}