import type {
  ArchivedSnakeSession,
  SnakeLabFrame,
  SnakeLabSlot,
  SnakeSession,
  SnakeWorldState,
} from "@/lib/snakeBackend";
import { idleSnakeWorld, SNAKE_LAB_BOARD_COUNT } from "@/lib/snakeBackend";

import { TestSnakeCanvas } from "../TestSnakeCanvas";
import { formatCareerRecord, mergeCareerWithLive } from "./snakeCareerMetrics";

export const SNAKE_CONTROL_HINT = "Arrow keys or WASD";

export const KEY_TO_ACTION: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

export function SnakePlaceholderBoard() {
  return <TestSnakeCanvas world={idleSnakeWorld(0)} />;
}

export function archivedSessionLabel(item: ArchivedSnakeSession): string {
  const name = item.scenario_key.replace(/-/g, " ");
  const outcome = item.outcome ? ` · ${item.outcome.replace(/_/g, " ")}` : "";
  return `${name} · ${item.steps} steps${outcome}`;
}

export function soloBoardMetrics(world: SnakeWorldState): string {
  if (world.done) {
    const outcome = world.outcome ? world.outcome.replace(/_/g, " ") : "ended";
    return `Score ${world.score} · length ${world.length} · ${outcome}`;
  }
  return `Score ${world.score} · length ${world.length} · step ${world.steps}`;
}

export function arenaBoardMetrics(world: SnakeWorldState): string {
  const you = world.player?.score ?? 0;
  const ai = world.opponent?.score ?? 0;
  if (world.done) {
    const result = world.winner ? `winner ${world.winner}` : world.outcome?.replace(/_/g, " ") ?? "ended";
    return `You ${you} · AI ${ai} · ${result}`;
  }
  return `You ${you} · AI ${ai} · step ${world.steps}`;
}

export type SnakeLabStat = {
  label: string;
  value: string;
};

function formatFloat(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function formatLabRecords(lab: SnakeLabFrame | null, slots: SnakeLabSlot[]): string {
  const live = slotLiveSummary(slots);
  const merged = mergeCareerWithLive(
    lab
      ? {
          apples: lab.record_apples ?? 0,
          moves: lab.record_moves ?? 0,
          length: lab.record_length ?? 0,
        }
      : null,
    { apples: live.maxApples, moves: live.maxSteps, length: live.maxLength },
  );
  return formatCareerRecord(merged);
}

function slotLiveSummary(slots: SnakeLabSlot[]) {
  let alive = 0;
  let maxApples = 0;
  let maxSteps = 0;
  let maxLength = 0;
  let bestCoverage = 0;
  for (const slot of slots) {
    const world = slot.world_state;
    if (!world.done) {
      alive += 1;
    }
    maxApples = Math.max(maxApples, world.score);
    maxSteps = Math.max(maxSteps, world.steps);
    maxLength = Math.max(maxLength, world.length);
    bestCoverage = Math.max(bestCoverage, world.coverage);
  }
  return { alive, maxApples, maxSteps, maxLength, bestCoverage };
}

/** Six lab readouts — one row beside Run, aligned with the six board columns. */
export function labTrainingStats(lab: SnakeLabFrame | null, slots: SnakeLabSlot[]): SnakeLabStat[] {
  const episode = lab?.episode ?? 0;
  const target = lab?.episodes_target ?? 100;
  const running = lab?.running ?? false;
  const draining = lab?.draining ?? false;
  const started = episode > 0 || running;
  const live = slotLiveSummary(slots);
  const boardCount = slots.length || SNAKE_LAB_BOARD_COUNT;

  const records = formatLabRecords(lab, slots);

  if (!started) {
    return [
      { label: "Boards", value: `${boardCount} ready` },
      { label: "Records", value: records },
      { label: "Run size", value: `${target} episodes` },
      { label: "Mode", value: `${boardCount} boards · coords DQN` },
      { label: "Epsilon", value: "0.30 start" },
      { label: "Checkpoint", value: "end of run" },
    ];
  }

  const state = running ? (draining ? "finishing" : "training") : episode >= target ? "complete" : "stopped";
  const checkpoint = lab?.checkpoint_ready ? "saved" : "pending";
  const speed = lab?.speed_multiplier ?? 1;
  const simulation = running
    ? draining
      ? `finishing ${live.alive} boards · ${speed}x`
      : `${live.alive} / ${boardCount} ticking · ${speed}x`
    : `paused · 0 / ${boardCount} ticking · ${speed}x`;
  return [
    { label: "Simulation", value: simulation },
    { label: "Records", value: records },
    {
      label: "Rolling 50ep",
      value: `${formatFloat(lab?.mean_apples ?? 0)} apples · length ${formatFloat(lab?.mean_length ?? 0)} · reward ${formatFloat(lab?.mean_reward ?? 0)}`,
    },
    {
      label: "Board snapshot",
      value: `${live.maxApples} apples · length ${live.maxLength} · ${Math.round(live.bestCoverage * 100)}% board`,
    },
    { label: "Status", value: `${state} · checkpoint ${checkpoint}` },
  ];
}

export function sessionMetrics(session: SnakeSession, extra?: string): string {
  const world = session.world_state;
  const base = world.mode === "arena" ? arenaBoardMetrics(world) : soloBoardMetrics(world);
  const policy = session.policy_action ? ` · policy ${session.policy_action}` : "";
  const suffix = extra ? ` · ${extra}` : "";
  return `${base}${policy}${suffix}`;
}
