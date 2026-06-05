import { useEffect, useRef, useState } from "react";

import { closeSnakeSession, createSnakeSession, stepSnakeSession, type SnakeSession } from "@/lib/snakeBackend";
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
    <TestShell backTo={testModelPath(modelKey)} backLabel="Snake Policy" title="Human play">
      <p className="test-scenario-hint">Arrow keys or WASD. Session logs to datasets on close.</p>
      {session ? (
        <TestSnakeCanvas
          world={session.world_state}
          suggestedDirection={session.policy_action}
        />
      ) : (
        <p className="test-empty">Loading…</p>
      )}
    </TestShell>
  );
}