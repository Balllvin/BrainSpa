import { SNAKE_LAB_SPEED_OPTIONS, type SnakeLabSpeed } from "@/lib/snakeBackend";

import { SnakeBar, SnakeBarGroup, SnakeBarSegment } from "./SnakeBar";

export function SnakeLabSpeedControl({
  speed,
  onSpeedChange,
}: {
  speed: SnakeLabSpeed;
  onSpeedChange: (speed: SnakeLabSpeed) => void;
}) {
  return (
    <SnakeBar className="snake-lab-speed-bar">
      <SnakeBarGroup>
        <span className="snake-lab-speed-label">Speed</span>
        <SnakeBarSegment
          value={speed}
          options={SNAKE_LAB_SPEED_OPTIONS.map((value) => ({
            value,
            label: `${value}x`,
          }))}
          onChange={onSpeedChange}
        />
      </SnakeBarGroup>
    </SnakeBar>
  );
}
