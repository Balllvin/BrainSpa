import { useCallback, useEffect, useRef, useState } from "react";

import {
  closeSnakeSession,
  createSnakeSession,
  stepSnakeSession,
  type SnakeSession,
} from "@/lib/snakeBackend";
import { testModelPath } from "@/lib/testRoutes";

import { TestSnakeCanvas } from "./TestSnakeCanvas";
import { SnakeBar, SnakeBarGroup, SnakeBarSegment } from "./snake/SnakeBar";
import { SnakeShell } from "./snake/SnakeShell";

type WatchPace = "slow" | "mid" | "fast";

const PACE_TICKS: Record<WatchPace, number> = {
  slow: 6,
  mid: 14,
  fast: 22,
};

export function TestInteractiveWatch({
  modelKey,
  scenarioKey,
}: {
  modelKey: string;
  scenarioKey: string;
}) {
  const [session, setSession] = useState<SnakeSession | null>(null);
  const [pace, setPace] = useState<WatchPace>("mid");
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
    const delay = Math.max(40, 1000 / PACE_TICKS[pace]);
    const handle = window.setInterval(() => {
      void tick();
    }, delay);
    return () => window.clearInterval(handle);
  }, [session, pace, tick]);

  return (
    <SnakeShell backTo={testModelPath(modelKey)}>
      <SnakeBar>
        <SnakeBarGroup>
          <SnakeBarSegment
            value={pace}
            options={[
              { value: "slow", label: "I", title: "Slow" },
              { value: "mid", label: "II", title: "Medium" },
              { value: "fast", label: "III", title: "Fast" },
            ]}
            onChange={setPace}
          />
        </SnakeBarGroup>
      </SnakeBar>
      <div className="snake-focus">
        {session ? <TestSnakeCanvas world={session.world_state} /> : <p className="snake-wait">···</p>}
      </div>
    </SnakeShell>
  );
}