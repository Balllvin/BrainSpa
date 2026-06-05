import type { ReactNode } from "react";

import type { SnakeWorldState } from "@/lib/snakeBackend";

type Props = {
  world: SnakeWorldState;
  highlight?: [number, number] | null;
  cellSize?: number;
  compact?: boolean;
};

const DEFAULT_CELL = 28;

export function TestSnakeCanvas({ world, highlight, cellSize, compact = false }: Props) {
  const CELL = cellSize ?? (compact ? 16 : DEFAULT_CELL);
  const gridSize = world.grid_size;
  const size = gridSize * CELL;
  const isArena = "mode" in world && world.mode === "arena" && world.player && world.opponent;

  const playerSnake = isArena ? world.player!.snake : world.snake;
  const opponentSnake = isArena ? world.opponent!.snake : [];
  const apple = world.apple;
  const playerAlive = isArena ? world.player!.alive : true;
  const opponentAlive = isArena ? world.opponent!.alive : false;

  const gridLines: ReactNode[] = [];
  for (let i = 1; i < gridSize; i += 1) {
    const pos = i * CELL;
    gridLines.push(
      <line key={`v-${i}`} x1={pos} y1={0} x2={pos} y2={size} className="snake-grid-line" />,
      <line key={`h-${i}`} x1={0} y1={pos} x2={size} y2={pos} className="snake-grid-line" />,
    );
  }

  const scoreLabel = isArena
    ? `${world.player?.score ?? 0} · ${world.opponent?.score ?? 0}`
    : String(world.score);

  return (
    <figure className={`snake-board${compact ? " snake-board--compact" : ""}`}>
      <svg width={size} height={size} className="snake-canvas" role="img" aria-label="Snake board">
        <rect width={size} height={size} className="snake-canvas-bg" />
        <g className="snake-grid">{gridLines}</g>
        {opponentSnake.map((segment, index) =>
          opponentAlive ? (
            <rect
              key={`o-${segment[0]}-${segment[1]}-${index}`}
              x={segment[0] * CELL + 1}
              y={segment[1] * CELL + 1}
              width={CELL - 2}
              height={CELL - 2}
              className={index === 0 ? "snake-cell snake-cell-opponent-head" : "snake-cell snake-cell-opponent"}
            />
          ) : null,
        )}
        {playerSnake.map((segment, index) =>
          playerAlive ? (
            <rect
              key={`p-${segment[0]}-${segment[1]}-${index}`}
              x={segment[0] * CELL + 1}
              y={segment[1] * CELL + 1}
              width={CELL - 2}
              height={CELL - 2}
              className={index === 0 ? "snake-cell snake-cell-head" : "snake-cell snake-cell-body"}
            />
          ) : null,
        )}
        <rect
          x={apple[0] * CELL + 1}
          y={apple[1] * CELL + 1}
          width={CELL - 2}
          height={CELL - 2}
          className="snake-cell snake-cell-apple"
        />
        {highlight ? (
          <rect
            x={highlight[0] * CELL}
            y={highlight[1] * CELL}
            width={CELL}
            height={CELL}
            className="snake-cell-highlight"
          />
        ) : null}
        <text x={size - 6} y={12} className="snake-score-label" textAnchor="end">
          {scoreLabel}
        </text>
      </svg>
      {!compact ? (
        <figcaption className="snake-legend">
          <span className="snake-legend-swatch snake-legend-swatch--you" title="You" />
          <span className="snake-legend-swatch snake-legend-swatch--apple" title="Apple" />
          {isArena ? <span className="snake-legend-swatch snake-legend-swatch--ai" title="AI" /> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}