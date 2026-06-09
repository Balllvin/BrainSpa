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

import { TestSnakeCanvas } from "./TestSnakeCanvas";
import { SnakeBar, SnakeBarGroup, SnakeBarSegment, SnakeTelemetry } from "./snake/SnakeBar";
import { KEY_TO_ACTION, SNAKE_CONTROL_HINT, SnakePlaceholderBoard, sessionMetrics } from "./snake/SnakeTestUtils";
import { SnakeShell } from "./snake/SnakeShell";

type ArenaPace = "human" | "fast";

export function TestInteractiveArena({
  modelKey,
  scenarioKey,
}: {
  modelKey: string;
  scenarioKey: string;
}) {
  const dualAi = scenarioKey === "dual-arena";
  const [session, setSession] = useState<SnakeSession | null>(null);
  const [pace, setPace] = useState<ArenaPace>(dualAi ? "fast" : "human");
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
        const created = await createSnakeSession(scenarioKey, "interactive_arena");
        if (created.ok && created.data) {
          sessionRef.current = created.data.session_id;
          setSession(created.data);
        }
      }
    }
  }, [scenarioKey]);

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
    const tps = pace === "human" ? SNAKE_HUMAN_TICKS_PER_SEC : SNAKE_WATCH_TICKS_PER_SEC;
    const delay = Math.max(40, 1000 / tps);
    const handle = window.setInterval(() => {
      void tick();
    }, delay);
    return () => window.clearInterval(handle);
  }, [dualAi, session, pace, tick]);

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

  const statusExtra = dualAi ? "two policies" : SNAKE_CONTROL_HINT;

  return (
    <SnakeShell backTo={testModelPath(modelKey)}>
      <SnakeBar>
        {dualAi ? (
          <SnakeBarGroup>
            <SnakeBarSegment
              value={pace}
              options={[
                { value: "human", label: "Slow" },
                { value: "fast", label: "Fast" },
              ]}
              onChange={setPace}
            />
          </SnakeBarGroup>
        ) : null}
        <SnakeTelemetry>
          {session
            ? sessionMetrics(session, statusExtra)
            : dualAi
              ? "Loading dual arena…"
              : `Loading arena · ${SNAKE_CONTROL_HINT}`}
        </SnakeTelemetry>
      </SnakeBar>
      <div className="snake-focus">
        {session ? (
          <TestSnakeCanvas
            world={session.world_state}
            policyAction={dualAi ? session.policy_action : null}
            opponentPolicyAction={session.opponent_action}
          />
        ) : (
          <SnakePlaceholderBoard />
        )}
      </div>
    </SnakeShell>
  );
}
