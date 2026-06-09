import {
  SNAKE_LAB_RUN_OPTIONS,
  SNAKE_LAB_SPEED_OPTIONS,
  type SnakeLabRuns,
  type SnakeLabSpeed,
} from "@/lib/snakeBackend";

import { SnakeBar, SnakeBarGroup, SnakeBarSegment } from "./SnakeBar";

export function SnakeLabHeaderControls({
  speed,
  runs,
  onSpeedChange,
  onRunsChange,
}: {
  speed: SnakeLabSpeed;
  runs: SnakeLabRuns;
  onSpeedChange: (speed: SnakeLabSpeed) => void;
  onRunsChange: (runs: SnakeLabRuns) => void;
}) {
  return (
    <SnakeBar className="snake-lab-ctrl-bar">
      <SnakeBarGroup>
        <span className="snake-lab-ctrl-label">Speed</span>
        <SnakeBarSegment
          value={speed}
          options={SNAKE_LAB_SPEED_OPTIONS.map((value) => ({
            value,
            label: `${value}x`,
          }))}
          onChange={onSpeedChange}
        />
      </SnakeBarGroup>
      <SnakeBarGroup>
        <span className="snake-lab-ctrl-label">Runs</span>
        <SnakeBarSegment
          value={runs}
          options={SNAKE_LAB_RUN_OPTIONS.map((value) => ({
            value,
            label: String(value),
          }))}
          onChange={onRunsChange}
        />
      </SnakeBarGroup>
    </SnakeBar>
  );
}
