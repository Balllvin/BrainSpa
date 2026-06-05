import type { SnakeWorldState } from "@/lib/snakeBackend";

type Props = {
  world: SnakeWorldState;
  highlight?: [number, number] | null;
  suggestedDirection?: string | null;
};

const CELL = 28;

export function TestSnakeCanvas({ world, highlight, suggestedDirection }: Props) {
  const size = world.grid_size * CELL;

  return (
    <div className="snake-stage">
      <svg width={size} height={size} className="snake-canvas" role="img" aria-label="Snake board">
        <rect width={size} height={size} className="snake-canvas-bg" />
        {world.snake.map((segment, index) => (
          <rect
            key={`${segment[0]}-${segment[1]}-${index}`}
            x={segment[0] * CELL + 1}
            y={segment[1] * CELL + 1}
            width={CELL - 2}
            height={CELL - 2}
            className={index === 0 ? "snake-cell snake-cell-head" : "snake-cell snake-cell-body"}
          />
        ))}
        <rect
          x={world.apple[0] * CELL + 1}
          y={world.apple[1] * CELL + 1}
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
      </svg>
      {suggestedDirection ? (
        <p className="snake-coach-hint">Policy says: {suggestedDirection.toUpperCase()}</p>
      ) : null}
      <dl className="snake-stats">
        <div>
          <dt>Score</dt>
          <dd>{world.score}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{world.length}</dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>{Math.round(world.coverage * 100)}%</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>{world.done ? world.outcome : "playing"}</dd>
        </div>
      </dl>
    </div>
  );
}