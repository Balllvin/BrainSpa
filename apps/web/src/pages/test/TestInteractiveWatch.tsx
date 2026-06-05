import { useCallback, useEffect, useRef, useState } from "react";

import {
  closeSnakeSession,
  createSnakeSession,
  SNAKE_WATCH_TICKS_PER_SEC,
  stepSnakeSession,
  type SnakeSession,
} from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestShell } from "./TestShell";
import { TestSnakeCanvas } from "./TestSnakeCanvas";

export function TestInteractiveWatch({
  modelKey,
  scenarioKey,
}: {
  modelKey: string;
  scenarioKey: string;
}) {
  const [session, setSession] = useState<SnakeSession | null>(null);
  const [speed, setSpeed] = useState(SNAKE_WATCH_TICKS_PER_SEC);
  const sessionRef = useRef<string | null>(null);

  const tick = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) {
      return;
    }
    const response = await stepSnakeSession(id);
    if (response.ok && response.data) {
      setSession(response.data);
      if (response.data.world_state.done) {
        await closeSnakeSession(id);
        const created = await createSnakeSession(scenarioKey, "interactive_watch");
        if (created.ok && created.data) {
          sessionRef.current = created.data.session_id;
          setSession(created.data);
        }
      }
    }
  }, [scenarioKey]);

  useEffect(() => {
    void (async () => {
      const created = await createSnakeSession(scenarioKey, "interactive_watch");
      if (created.ok && created.data) {
        sessionRef.current = created.data.session_id;
        setSession(created.data);
      }
    })();
    return () => {
      if (sessionRef.current) {
        void closeSnakeSession(sessionRef.current);
      }
    };
  }, [scenarioKey]);

  useEffect(() => {
    if (!session || session.world_state.done) {
      return;
    }
    const delay = Math.max(50, 1000 / speed);
    const handle = window.setInterval(() => {
      void tick();
    }, delay);
    return () => window.clearInterval(handle);
  }, [session, speed, tick]);

  return (
    <TestShell backTo={testModelPath(modelKey)} backLabel="Snake Policy" title="Autonomous watch">
      <label className="field">
        <span>Speed (ticks/s)</span>
        <input
          type="range"
          min={2}
          max={24}
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
        />
      </label>
      {session ? (
        <>
          <TestSnakeCanvas world={session.world_state} />
          {session.policy_action ? (
            <p className="test-scenario-hint">Policy: {session.policy_action}</p>
          ) : null}
        </>
      ) : (
        <p className="test-empty">Loading board…</p>
      )}
    </TestShell>
  );
}