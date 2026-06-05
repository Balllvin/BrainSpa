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
};

export type SnakeSession = {
  session_id: string;
  scenario_key: string;
  mode: string;
  episode_id: string;
  world_state: SnakeWorldState;
  policy_action: string | null;
  transition_count: number;
  checkpoint_ready: boolean;
  last_reward?: Record<string, number>;
};

export type PolicyTrainJob = {
  state: string;
  phase: string;
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

export async function startPolicyTrain(episodes = 100) {
  return postJson<PolicyTrainJob>("/api/policy/train", {
    model_key: "snake_policy",
    episodes,
    env_profiles: ["solo", "wrapped_v2"],
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
    if (response.status === 204 || !response.ok) {
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

export function policyTrainStreamUrl() {
  return backendUrl("/api/policy/snake/train-stream");
}