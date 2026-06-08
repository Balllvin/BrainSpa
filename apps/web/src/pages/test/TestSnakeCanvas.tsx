import type { ReactNode } from "react";

import type { SnakeWorldState } from "@/lib/snakeBackend";

const POLICY_VECTOR: Record<string, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

type Props = {
  world: SnakeWorldState;
  highlight?: [number, number] | null;
  policyAction?: string | null;
  opponentPolicyAction?: string | null;
  cellSize?: number;
  compact?: boolean;
};

const DEFAULT_CELL = 28;

type SnakeDraw = {
  segments: [number, number][];
  direction: string;
  alive: boolean;
  role: "player" | "opponent";
};

function cellCenter(x: number, y: number, cell: number) {
  return { cx: x * cell + cell / 2, cy: y * cell + cell / 2 };
}

function wedgePoints(cx: number, cy: number, direction: string, cell: number) {
  const pad = cell * 0.22;
  const tip = cell * 0.38;
  switch (direction) {
    case "up":
      return `${cx},${cy - tip} ${cx - tip + pad},${cy + pad} ${cx + tip - pad},${cy + pad}`;
    case "down":
      return `${cx},${cy + tip} ${cx - tip + pad},${cy - pad} ${cx + tip - pad},${cy - pad}`;
    case "left":
      return `${cx - tip},${cy} ${cx + pad},${cy - tip + pad} ${cx + pad},${cy + tip - pad}`;
    default:
      return `${cx + tip},${cy} ${cx - pad},${cy - tip + pad} ${cx - pad},${cy + tip - pad}`;
  }
}

function bodyFillOpacity(index: number, total: number) {
  if (index === 0) {
    return 1;
  }
  const tailWeight = 1 - index / Math.max(total - 1, 1);
  return 0.35 + tailWeight * 0.45;
}

function SnakeSegments({ snake, cell }: { snake: SnakeDraw; cell: number }) {
  const headClass = snake.role === "opponent" ? "snake-cell-opponent-head" : "snake-cell-head";
  const bodyClass = snake.role === "opponent" ? "snake-cell-opponent" : "snake-cell-body";

  return (
    <>
      {snake.segments.map((segment, index) => {
        if (!snake.alive) {
          return null;
        }
        const isHead = index === 0;
        const { cx, cy } = cellCenter(segment[0], segment[1], cell);
        return (
          <g key={`${snake.role}-${segment[0]}-${segment[1]}-${index}`}>
            <rect
              x={segment[0] * cell + 1}
              y={segment[1] * cell + 1}
              width={cell - 2}
              height={cell - 2}
              className={`snake-cell ${isHead ? headClass : bodyClass}`}
              fillOpacity={isHead ? 1 : bodyFillOpacity(index, snake.segments.length)}
              rx={isHead ? 2 : 1}
            />
            {isHead ? (
              <>
                <polygon
                  points={wedgePoints(cx, cy, snake.direction, cell)}
                  className={`snake-head-wedge snake-head-wedge--${snake.role}`}
                />
                {!compactRay(cell) ? (
                  <HeadingRay cx={cx} cy={cy} direction={snake.direction} cell={cell} role={snake.role} />
                ) : null}
              </>
            ) : null}
          </g>
        );
      })}
    </>
  );
}

function compactRay(cell: number) {
  return cell <= 18;
}

function HeadingRay({
  cx,
  cy,
  direction,
  cell,
  role,
}: {
  cx: number;
  cy: number;
  direction: string;
  cell: number;
  role: "player" | "opponent";
}) {
  const vector = POLICY_VECTOR[direction];
  if (!vector) {
    return null;
  }
  const reach = cell * 0.72;
  return (
    <line
      x1={cx}
      y1={cy}
      x2={cx + vector.dx * reach}
      y2={cy + vector.dy * reach}
      className={`snake-heading-line snake-heading-line--${role}`}
    />
  );
}

function PolicyIntent({
  head,
  action,
  cell,
}: {
  head: [number, number];
  action: string;
  cell: number;
}) {
  const vector = POLICY_VECTOR[action];
  if (!vector) {
    return null;
  }
  const { cx, cy } = cellCenter(head[0], head[1], cell);
  const reach = cell * 0.9;
  return (
    <>
      <line
        x1={cx}
        y1={cy}
        x2={cx + vector.dx * reach}
        y2={cy + vector.dy * reach}
        className="snake-policy-intent"
      />
      <circle
        cx={cx + vector.dx * reach}
        cy={cy + vector.dy * reach}
        r={Math.max(2, cell * 0.12)}
        className="snake-policy-intent-cap"
      />
    </>
  );
}

function AppleMarker({ apple, cell }: { apple: [number, number]; cell: number }) {
  const { cx, cy } = cellCenter(apple[0], apple[1], cell);
  const radius = cell * 0.32;
  return (
    <>
      <circle cx={cx} cy={cy} r={radius + 2} className="snake-apple-ring" />
      <circle cx={cx} cy={cy} r={radius} className="snake-apple-core" />
    </>
  );
}

export function TestSnakeCanvas({
  world,
  highlight,
  policyAction,
  opponentPolicyAction,
  cellSize,
  compact = false,
}: Props) {
  const CELL = cellSize ?? (compact ? 16 : DEFAULT_CELL);
  const gridSize = world.grid_size;
  const size = gridSize * CELL;
  const isArena = world.mode === "arena" && world.player && world.opponent;

  const playerSnake: SnakeDraw = isArena
    ? {
        segments: world.player!.snake,
        direction: world.player!.direction ?? world.direction,
        alive: world.player!.alive,
        role: "player",
      }
    : {
        segments: world.snake,
        direction: world.direction,
        alive: !world.done,
        role: "player",
      };

  const opponentSnake: SnakeDraw | null = isArena
    ? {
        segments: world.opponent!.snake,
        direction: world.opponent!.direction ?? "down",
        alive: world.opponent!.alive,
        role: "opponent",
      }
    : null;

  const playerHead = playerSnake.segments[0] ?? null;
  const opponentHead = opponentSnake?.segments[0] ?? null;
  const showPlayerPolicy =
    policyAction &&
    playerHead &&
    playerSnake.alive &&
    (!highlight || (highlight[0] === playerHead[0] && highlight[1] === playerHead[1]));
  const showOpponentPolicy = opponentPolicyAction && opponentHead && opponentSnake?.alive;

  const gridLines: ReactNode[] = [];
  for (let i = 1; i < gridSize; i += 1) {
    const pos = i * CELL;
    gridLines.push(
      <line key={`v-${i}`} x1={pos} y1={0} x2={pos} y2={size} className="snake-grid-line" />,
      <line key={`h-${i}`} x1={0} y1={pos} x2={size} y2={pos} className="snake-grid-line" />,
    );
  }

  const scoreLabel = isArena
    ? `you ${world.player?.score ?? 0} · ai ${world.opponent?.score ?? 0}`
    : `score ${world.score}`;

  const headingLabel = playerSnake.alive ? playerSnake.direction : world.outcome?.replace(/_/g, " ") ?? "—";

  return (
    <figure className={`snake-board${compact ? " snake-board--compact" : ""}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="snake-canvas"
        role="img"
        aria-label="Snake board"
      >
        <rect width={size} height={size} className="snake-canvas-bg" />
        <g className="snake-grid">{gridLines}</g>
        <AppleMarker apple={world.apple} cell={CELL} />
        {opponentSnake ? <SnakeSegments snake={opponentSnake} cell={CELL} /> : null}
        <SnakeSegments snake={playerSnake} cell={CELL} />
        {showPlayerPolicy && playerHead ? (
          <PolicyIntent head={playerHead} action={policyAction!} cell={CELL} />
        ) : null}
        {showOpponentPolicy && opponentHead ? (
          <PolicyIntent head={opponentHead} action={opponentPolicyAction!} cell={CELL} />
        ) : null}
        {highlight ? (
          <rect
            x={highlight[0] * CELL}
            y={highlight[1] * CELL}
            width={CELL}
            height={CELL}
            className="snake-cell-highlight"
          />
        ) : null}
        {highlight && policyAction && POLICY_VECTOR[policyAction] ? (
          <line
            x1={highlight[0] * CELL + CELL / 2}
            y1={highlight[1] * CELL + CELL / 2}
            x2={
              highlight[0] * CELL +
              CELL / 2 +
              POLICY_VECTOR[policyAction].dx * (CELL * 0.42)
            }
            y2={
              highlight[1] * CELL +
              CELL / 2 +
              POLICY_VECTOR[policyAction].dy * (CELL * 0.42)
            }
            className="snake-policy-arrow"
          />
        ) : null}
        <text x={6} y={11} className="snake-board-label" textAnchor="start">
          {headingLabel}
        </text>
        <text x={size - 6} y={11} className="snake-score-label" textAnchor="end">
          {scoreLabel}
        </text>
      </svg>
      {!compact ? (
        <figcaption className="snake-legend">
          <span className="snake-legend-item">
            <span className="snake-legend-swatch snake-legend-swatch--you" />
            you · wedge = heading
          </span>
          <span className="snake-legend-item">
            <span className="snake-legend-swatch snake-legend-swatch--apple" />
            apple
          </span>
          {isArena ? (
            <span className="snake-legend-item">
              <span className="snake-legend-swatch snake-legend-swatch--ai" />
              ai
            </span>
          ) : null}
          {policyAction || opponentPolicyAction ? (
            <span className="snake-legend-item">
              <span className="snake-legend-swatch snake-legend-swatch--policy" />
              policy next
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
