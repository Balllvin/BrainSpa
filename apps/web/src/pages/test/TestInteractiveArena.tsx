import { useCallback, useEffect, useRef, useState } from "react";

import {
  closeSnakeSession,
  createSnakeSession,
  SNAKE_HUMAN_TICKS_PER_SEC,
  SNAKE_WATCH_TICKS_PER_SEC,
  stepSnakeSession,
  type SnakeSession,
} from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestShell } from "./TestShell";
import { TestSnakeCanvas } from "./TestSnakeCanvas";

const KEY_TO_ACTION: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

export function TestInteractiveArena({
  modelKey,
  scenarioKey,
}: {
  modelKey: string;
  scenarioKey: string;
}) {
  const dualAi = scenarioKey === "dual-arena";
  const [session, setSession] = useState<SnakeSession | null>(null);
  const [speed, setSpeed] = useState(dualAi ? SNAKE_WATCH_TICKS_PER_SEC : SNAKE_HUMAN_TICKS_PER_SEC);
  const sessionRef = useRef<string | null>(null);

  const tick = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) {
      return;
    }
    const response = await stepSnakeSession(id, dualAi ? undefined : undefined);
    if (response.ok && response.data) {
      setSession(response.data);
      if (response.data.world_state.done) {
        await closeSnakeSession(id);
        const created = await createSnakeSession(scenarioKey, "interactive_arena");
        if (created.ok && created.data) {
          sessionRef.current = created.data.session_id;
          setSession(created.data);
        }
      }
    }
  }, [dualAi, scenarioKey]);

  useEffect(() => {
    void (async () => {
      const created = await createSnakeSession(scenarioKey, "interactive_arena");
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
    if (!dualAi || !session || session.world_state.done) {
      return;
    }
    const delay = Math.max(50, 1000 / speed);
    const handle = window.setInterval(() => {
      void tick();
    }, delay);
    return () => window.clearInterval(handle);
  }, [dualAi, session, speed, tick]);

  useEffect(() => {
    if (dualAi) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      const action = KEY_TO_ACTION[event.key];
      if (!action || !sessionRef.current) {
        return;
      }
      event.preventDefault();
      void stepSnakeSession(sessionRef.current, action).then(async (response) => {
        if (!response.ok || !response.data) {
          return;
        }
        setSession(response.data);
        if (response.data.world_state.done) {
          await closeSnakeSession(sessionRef.current!);
          const created = await createSnakeSession(scenarioKey, "interactive_arena");
          if (created.ok && created.data) {
            sessionRef.current = created.data.session_id;
            setSession(created.data);
          }
        }
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dualAi, scenarioKey]);

  const title = dualAi ? "Dual arena" : "Human vs AI";

  return (
    <TestShell backTo={testModelPath(modelKey)} backLabel="Snake Policy" title={title}>
      <p className="test-scenario-hint">
        {dualAi
          ? "Both snakes use the same policy checkpoint. Adjust speed to watch."
          : "Arrow keys or WASD. AI uses the trained policy."}
      </p>
      {dualAi ? (
        <label className="field">
          <span>Speed (ticks/s)</span>
          <input
            type="range"
            min={4}
            max={24}
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
        </label>
      ) : null}
      {session ? (
        <TestSnakeCanvas
          world={session.world_state}
          suggestedDirection={dualAi ? null : session.policy_action}
          opponentDirection={session.opponent_action}
        />
      ) : (
        <p className="test-empty">Loading…</p>
      )}
    </TestShell>
  );
}