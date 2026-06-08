import { useEffect, useRef, useState } from "react";

import { closeSnakeSession, createSnakeSession, stepSnakeSession, type SnakeSession } from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestSnakeCanvas } from "./TestSnakeCanvas";
import { SnakeBar, SnakeTelemetry } from "./snake/SnakeBar";
import { KEY_TO_ACTION, SNAKE_CONTROL_HINT, SnakePlaceholderBoard, sessionMetrics } from "./snake/SnakeTestUtils";
import { SnakeShell } from "./snake/SnakeShell";

export function TestInteractivePlay({
  modelKey,
  scenarioKey,
}: {
  modelKey: string;
  scenarioKey: string;
}) {
  const [session, setSession] = useState<SnakeSession | null>(null);
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    void (async () => {
      const created = await createSnakeSession(scenarioKey, "interactive_play");
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
          const created = await createSnakeSession(scenarioKey, "interactive_play");
          if (created.ok && created.data) {
            sessionRef.current = created.data.session_id;
            setSession(created.data);
          }
        }
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenarioKey]);

  return (
    <SnakeShell backTo={testModelPath(modelKey)}>
      <SnakeBar>
        <SnakeTelemetry>
          {session ? sessionMetrics(session, SNAKE_CONTROL_HINT) : `Loading board · ${SNAKE_CONTROL_HINT}`}
        </SnakeTelemetry>
      </SnakeBar>
      <div className="snake-focus">
        {session ? <TestSnakeCanvas world={session.world_state} /> : <SnakePlaceholderBoard />}
      </div>
    </SnakeShell>
  );
}
