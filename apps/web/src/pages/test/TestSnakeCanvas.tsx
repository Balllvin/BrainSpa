import type { SnakeWorldState } from "@/lib/snakeBackend";

type Props = {
  world: SnakeWorldState;
  highlight?: [number, number] | null;
  suggestedDirection?: string | null;
  opponentDirection?: string | null;
};

const CELL = 28;

export function TestSnakeCanvas({ world, highlight, suggestedDirection, opponentDirection }: Props) {
  const gridSize = world.grid_size;
  const size = gridSize * CELL;
  const isArena = "mode" in world && world.mode === "arena" && world.player && world.opponent;

  const playerSnake = isArena ? world.player!.snake : (world as SnakeWorldState).snake;
  const opponentSnake = isArena ? world.opponent!.snake : [];
  const apple = world.apple;
  const playerAlive = isArena ? world.player!.alive : true;
  const opponentAlive = isArena ? world.opponent!.alive : false;

  return (
    <div className="snake-stage">
      <svg width={size} height={size} className="snake-canvas" role="img" aria-label="Snake board">
        <rect width={size} height={size} className="snake-canvas-bg" />
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
      </svg>
      {suggestedDirection ? (
        <p className="snake-coach-hint">You: {suggestedDirection.toUpperCase()}</p>
      ) : null}
      {opponentDirection ? (
        <p className="snake-coach-hint snake-coach-hint--ai">AI: {opponentDirection.toUpperCase()}</p>
      ) : null}
      {!isArena ? <SoloStats world={world} /> : <ArenaStats world={world} />}
    </div>
  );
}

function SoloStats({ world }: { world: SnakeWorldState }) {
  return (
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
  );
}

function ArenaStats({ world }: { world: SnakeWorldState }) {
  return (
    <dl className="snake-stats">
      <div>
        <dt>You</dt>
        <dd>{world.player?.score ?? 0}</dd>
      </div>
      <div>
        <dt>AI</dt>
        <dd>{world.opponent?.score ?? 0}</dd>
      </div>
      <div>
        <dt>Result</dt>
        <dd>{world.done ? `${world.outcome} (${world.winner})` : "playing"}</dd>
      </div>
    </dl>
  );
}