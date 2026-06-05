import { backendUrl } from "@/lib/backend";

const REQUEST_TIMEOUT_MS = 30_000;

export type SnakeWorldState = {
  grid_size: number;
  snake: [number, number][];
  direction: string;
  apple: [number, number];
  score: number;
  steps: number;
  length: number;
  coverage: number;
  done: boolean;
  outcome: string;
  mode?: string;
  player?: { snake: [number, number][]; score: number; alive: boolean };
  opponent?: { snake: [number, number][]; score: number; alive: boolean };
  winner?: string;
};

export type SnakeSession = {
  session_id: string;
  scenario_key: string;
  mode: string;
  episode_id: string;
  world_state: SnakeWorldState;
  policy_action: string | null;
  opponent_action?: string | null;
  transition_count: number;
  checkpoint_ready: boolean;
  last_reward?: Record<string, number>;
};

export type PolicyTrainJob = {
  state: string;
  phase?: string;
  episode: number;
  episodes_target: number;
  epsilon: number;
  mean_reward: number;
  mean_length?: number;
  mean_apples?: number;
  curriculum_stage?: string;
  last_outcome?: string;
  error?: string | null;
};

export type PolicyEvalResult = {
  episodes: number;
  mean_length: number;
  mean_apples: number;
  mean_coverage: number;
  full_board_count: number;
  full_board_rate: number;
  consecutive_full_board_max: number;
  death_breakdown: Record<string, number>;
  oracle_agreement_rate: number;
  passed: boolean;
  north_star: string;
  artifact_path: string;
};

export type ArchivedSnakeSession = {
  session_id: string;
  scenario_key: string;
  steps: number;
  outcome: string | null;
};

export type SnakeLabPace = "human" | "watch" | "train";

export type SnakeLabSlot = {
  index: number;
  profile: string;
  world_state: SnakeWorldState;
  episode_reward: number;
  last_outcome: string | null;
};

export type SnakeLabFrame = {
  running: boolean;
  pace: SnakeLabPace;
  slots: SnakeLabSlot[];
  slot_count: number;
  episode: number;
  episodes_target: number;
  epsilon: number;
  mean_reward: number;
  mean_length: number;
  mean_apples: number;
  curriculum_stage: string;
  checkpoint_ready: boolean;
};

/** Human play / vs-AI: comfortable reaction time (~8 ticks/s). */
export const SNAKE_HUMAN_TICKS_PER_SEC = 8;

/** Policy watch: faster than human, still readable. */
export const SNAKE_WATCH_TICKS_PER_SEC = 14;

export type CoachDiff = {
  found: boolean;
  message?: string;
  step?: number;
  total_steps?: number;
  human_action?: string;
  policy_action?: string;
  head?: [number, number];
  session_id?: string;
};

async function postJson<T>(path: string, body: unknown): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  try {
    const response = await fetch(backendUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, data: null, error: `Request failed (${response.status})` };
    }
    return { ok: true, data: (await response.json()) as T, error: null };
  } catch {
    return { ok: false, data: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export async function createSnakeSession(scenarioKey: string, mode: string, seed?: number) {
  return postJson<SnakeSession>("/api/env/snake/session", { scenario_key: scenarioKey, mode, seed });
}

export async function stepSnakeSession(sessionId: string, action?: string) {
  return postJson<SnakeSession>("/api/env/snake/step", { session_id: sessionId, action });
}

export async function closeSnakeSession(sessionId: string) {
  return postJson<{ closed: boolean }>(`/api/env/snake/session/${encodeURIComponent(sessionId)}/close`, {});
}

export async function startPolicyTrain(episodes = 100, policyBackend: "dqn" | "sb3" = "dqn") {
  return postJson<PolicyTrainJob>("/api/policy/train", {
    model_key: "snake_policy",
    episodes,
    env_profiles: ["solo", "wrapped_v2", "arena"],
    policy_backend: policyBackend,
  });
}

export async function fetchPolicyTrainJob() {
  try {
    const response = await fetch(backendUrl("/api/policy/snake/train-job"), { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, job: null as PolicyTrainJob | null, error: `Status ${response.status}` };
    }
    return { ok: true, job: (await response.json()) as PolicyTrainJob, error: null };
  } catch {
    return { ok: false, job: null, error: "Backend offline" };
  }
}

export async function runPolicyEval(episodes = 100) {
  return postJson<PolicyEvalResult>("/api/policy/snake/eval", {
    model_key: "snake_policy",
    episodes,
    scenario_key: "autonomous-watch",
  });
}

export async function fetchPolicyEvalLatest() {
  try {
    const response = await fetch(backendUrl("/api/policy/snake/eval/latest"), { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, data: null, error: null };
    }
    return { ok: true, data: (await response.json()) as PolicyEvalResult, error: null };
  } catch {
    return { ok: false, data: null, error: "Backend offline" };
  }
}

export async function fetchSnakeDatasetSummary() {
  try {
    const response = await fetch(backendUrl("/api/datasets/snake/policy-summary"), { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, summary: null, error: `Status ${response.status}` };
    }
    return { ok: true, summary: await response.json(), error: null };
  } catch {
    return { ok: false, summary: null, error: "Backend offline" };
  }
}

export async function fetchArchivedSnakeSessions() {
  try {
    const response = await fetch(backendUrl("/api/env/snake/sessions/archived"), { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, sessions: [] as ArchivedSnakeSession[], error: `Status ${response.status}` };
    }
    return { ok: true, sessions: (await response.json()) as ArchivedSnakeSession[], error: null };
  } catch {
    return { ok: false, sessions: [], error: "Backend offline" };
  }
}

export async function fetchCoachDiff(sessionId: string, step?: number) {
  try {
    const query = step !== undefined ? `?step=${step}` : "";
    const response = await fetch(backendUrl(`/api/env/snake/coach/${encodeURIComponent(sessionId)}/diff${query}`), {
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, diff: null, error: `Status ${response.status}` };
    }
    return { ok: true, diff: (await response.json()) as CoachDiff, error: null };
  } catch {
    return { ok: false, diff: null, error: "Backend offline" };
  }
}

export async function fetchCoachStep(sessionId: string, step: number) {
  try {
    const response = await fetch(
      backendUrl(`/api/env/snake/coach/${encodeURIComponent(sessionId)}?step=${step}`),
      { cache: "no-store" },
    );
    if (!response.ok) {
      return { ok: false, data: null, error: `Status ${response.status}` };
    }
    return { ok: true, data: await response.json(), error: null };
  } catch {
    return { ok: false, data: null, error: "Backend offline" };
  }
}

export function policyTrainStreamUrl() {
  return backendUrl("/api/policy/snake/train-stream");
}

export async function startSnakeLab(
  slots = 6,
  episodes = 200,
  pace: SnakeLabPace = "train",
) {
  return postJson<{ ok: boolean; lab: SnakeLabFrame; message?: string }>("/api/env/snake/lab/start", {
    slots,
    episodes,
    pace,
  });
}

export async function stopSnakeLab() {
  return postJson<{ ok: boolean; lab: SnakeLabFrame }>("/api/env/snake/lab/stop", {});
}

export async function fetchSnakeLab() {
  try {
    const response = await fetch(backendUrl("/api/env/snake/lab"), { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, lab: null as SnakeLabFrame | null, error: `Status ${response.status}` };
    }
    return { ok: true, lab: (await response.json()) as SnakeLabFrame, error: null };
  } catch {
    return { ok: false, lab: null, error: "Backend offline" };
  }
}

export function snakeLabStreamUrl() {
  return backendUrl("/api/env/snake/lab/stream");
}