import { backendUrl } from "@/lib/backend";

// --- Types -----------------------------------------------------------------

export interface MlEnvSpec {
  id: string;
  label: string;
  description: string;
  obs_dim: number;
  num_actions: number;
  max_episode_steps: number;
  tags: string[];
  reward_threshold: number | null;
  source: string;
  tabular_ready: boolean;
  discrete_states: number | null;
}

export interface MlAlgoSpec {
  id: string;
  label: string;
  description: string;
  family?: string;
  tasks?: string[];
  needs_torch: boolean;
  default_hyperparams: Record<string, number | string>;
  source: string;
  tags?: string[];
  available: boolean;
}

export interface MlBuiltinDataset {
  name: string;
  description: string;
}

export interface MlCatalog {
  environments: MlEnvSpec[];
  rl_algorithms: MlAlgoSpec[];
  supervised_algorithms: MlAlgoSpec[];
  builtin_datasets: MlBuiltinDataset[];
}

export interface MlColumn {
  name: string;
  dtype: string;
  missing: number;
  count: number;
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
  unique?: number;
  top_values?: string[];
}

export interface MlDataset {
  id: string;
  name: string;
  format: string;
  source: string;
  row_count: number;
  columns: MlColumn[];
  created_at: number;
  sample_rows?: Record<string, unknown>[];
}

export interface MlMetric {
  episode?: number;
  epoch?: number;
  global_step?: number;
  episode_return?: number;
  mean_return?: number;
  episode_length?: number;
  epsilon?: number;
  train_loss?: number;
  [key: string]: number | undefined;
}

export interface MlRun {
  id: string;
  kind: "rl" | "supervised";
  algo: string;
  label: string;
  target: Record<string, unknown>;
  hyperparams: Record<string, number | string>;
  status: string;
  created_at: number;
  updated_at: number;
  metric_count: number;
  last_metric: MlMetric | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  checkpoint_path: string | null;
  metrics?: MlMetric[];
}

export interface MlSkillWorker {
  key: string;
  label: string;
  role: string;
  summary: string;
  skill_count: number;
  skills: MlSkill[];
}

export interface MlSkill {
  key: string;
  label: string;
  worker: string;
  worker_label: string;
  loop_stage: string;
  description: string;
  when_to_use: string;
  inputs: string[];
  example: string;
  kind: string;
}

type Result<T> = { ok: boolean; data: T | null; error: string | null };

const OFFLINE = "Backend is offline. Start it with npm run start.";

async function getJson<T>(path: string): Promise<Result<T>> {
  try {
    const response = await fetch(backendUrl(path), { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { ok: false, data: null, error: `Request failed (${response.status})` };
    return { ok: true, data: (await response.json()) as T, error: null };
  } catch {
    return { ok: false, data: null, error: OFFLINE };
  }
}

async function sendJson<T>(path: string, payload: unknown, method = "POST"): Promise<Result<T>> {
  try {
    const response = await fetch(backendUrl(path), {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      let detail = `Request failed (${response.status})`;
      try {
        const body = (await response.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        /* ignore */
      }
      return { ok: false, data: null, error: detail };
    }
    return { ok: true, data: (await response.json()) as T, error: null };
  } catch {
    return { ok: false, data: null, error: OFFLINE };
  }
}

// --- Catalog & datasets ----------------------------------------------------

export const fetchMlCatalog = () => getJson<MlCatalog>("/api/ml/catalog");
export const fetchMlDatasets = () => getJson<MlDataset[]>("/api/ml/datasets");
export const fetchMlDataset = (id: string) => getJson<MlDataset>(`/api/ml/datasets/${encodeURIComponent(id)}`);
export const uploadMlDataset = (name: string, content: string, format: string) =>
  sendJson<MlDataset>("/api/ml/datasets/upload", { name, content, format });
export const addBuiltinDataset = (name: string, rows = 300) =>
  sendJson<MlDataset>("/api/ml/datasets/builtin", { name, rows });
export const deleteMlDataset = (id: string) =>
  sendJson<{ deleted: boolean }>(`/api/ml/datasets/${encodeURIComponent(id)}`, {}, "DELETE");

// --- Training & runs -------------------------------------------------------

export interface TrainRlBody {
  kind: "rl";
  env_id: string;
  algo: string;
  hyperparams?: Record<string, number | string>;
  label?: string;
}

export interface TrainSupervisedBody {
  kind: "supervised";
  dataset_id: string;
  target: string;
  features?: string[];
  algo: string;
  hyperparams?: Record<string, number | string>;
  label?: string;
}

export const submitTraining = (body: TrainRlBody | TrainSupervisedBody) => sendJson<MlRun>("/api/ml/train", body);
export const fetchMlRuns = () => getJson<MlRun[]>("/api/ml/runs");
export const fetchMlRun = (id: string) => getJson<MlRun>(`/api/ml/runs/${encodeURIComponent(id)}`);
export const stopMlRun = (id: string) => sendJson<MlRun>(`/api/ml/runs/${encodeURIComponent(id)}/stop`, {});
export const deleteMlRun = (id: string) => sendJson<{ deleted: boolean }>(`/api/ml/runs/${encodeURIComponent(id)}`, {}, "DELETE");
export const inferMlRun = (id: string, body: { row?: Record<string, unknown>; seed?: number }) =>
  sendJson<Record<string, unknown>>(`/api/ml/runs/${encodeURIComponent(id)}/infer`, body);

// --- Agents / skills -------------------------------------------------------

export const fetchAgentSkills = () => getJson<{ workers: MlSkillWorker[]; skills: MlSkill[] }>("/api/agents/skills");

// --- Live metrics stream ---------------------------------------------------

export function streamMlRun(runId: string, onEvent: (event: { type: string; metrics?: MlMetric[]; run?: Partial<MlRun> }) => void): () => void {
  const source = new EventSource(backendUrl(`/api/ml/runs/${encodeURIComponent(runId)}/stream`));
  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data);
      onEvent(event);
      if (event.type === "done" || event.type === "error") source.close();
    } catch {
      source.close();
    }
  };
  source.onerror = () => source.close();
  return () => source.close();
}
