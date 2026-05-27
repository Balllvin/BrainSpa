import type {
  AdapterTestResult,
  BrainSpaOverview,
  ChipmunkChatResult,
  DatasetProfile,
  DatasetGenerateResult,
  EvalRunResult,
  HermesSetup,
  ModelProfile,
  TelegramBotCreate,
  TelegramBotPublic,
  TelegramAuthorizationResult,
  TrainingDryRunResult,
  TrainingAdapterBuildResult,
  WorkerRunResult,
} from "@/lib/types";

const DEFAULT_BACKEND = "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 8000;

export function backendUrl(path: string): string {
  const base = import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function fetchBrainSpaOverview(): Promise<{ ok: boolean; overview: BrainSpaOverview | null }> {
  try {
    const response = await fetch(backendUrl("/api/overview"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, overview: null };
    }
    return { ok: true, overview: (await response.json()) as BrainSpaOverview };
  } catch {
    return { ok: false, overview: null };
  }
}

export async function createTelegramBot(
  bot: TelegramBotCreate,
): Promise<{ ok: boolean; bot: TelegramBotPublic | null; error: string | null }> {
  try {
    const response = await fetch(backendUrl("/api/telegram/bots"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bot),
    });
    if (!response.ok) {
      return { ok: false, bot: null, error: `Backend rejected bot config (${response.status})` };
    }
    return { ok: true, bot: (await response.json()) as TelegramBotPublic, error: null };
  } catch {
    return { ok: false, bot: null, error: "Backend is offline. Start it with npm run api." };
  }
}

async function postJson<T>(path: string, payload: unknown): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  try {
    const response = await fetch(backendUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, data: null, error: `Backend rejected request (${response.status})` };
    }
    return { ok: true, data: (await response.json()) as T, error: null };
  } catch {
    return { ok: false, data: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export function generateDataset(exampleCount = 12) {
  return postJson<DatasetGenerateResult>("/api/datasets/generate", { example_count: exampleCount });
}

export function runTrainingDryRun() {
  return postJson<TrainingDryRunResult>("/api/training/dry-run", {});
}

export function buildTrainingAdapter() {
  return postJson<TrainingAdapterBuildResult>("/api/training/build-adapter", {});
}

export function testTrainingAdapter(prompt: string) {
  return postJson<AdapterTestResult>("/api/training/test-adapter", { prompt });
}

export function runEval(environmentKey: string, answer: string, fen?: string, prompt?: string) {
  return postJson<EvalRunResult>("/api/evals/run", {
    environment_key: environmentKey,
    answer,
    fen,
    prompt,
  });
}

export function runWorkerPreview(agentKey: string, backend: string, task: string) {
  return postJson<WorkerRunResult>("/api/workers/run", {
    agent_key: agentKey,
    backend,
    task,
  });
}

export function askChipmunk(message: string) {
  return postJson<ChipmunkChatResult>("/api/chipmunk/chat", { message });
}

export function updateDatasetState(datasetKey: string, state: string) {
  return postJson<DatasetProfile>(`/api/datasets/${datasetKey}/state`, { state });
}

export function updateModelState(modelKey: string, state: string) {
  return postJson<ModelProfile>(`/api/models/${modelKey}/state`, { state });
}

export async function fetchHermesSetup(): Promise<{ ok: boolean; data: HermesSetup | null }> {
  try {
    const response = await fetch(backendUrl("/api/hermes/setup"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, data: null };
    return { ok: true, data: (await response.json()) as HermesSetup };
  } catch {
    return { ok: false, data: null };
  }
}

export function authorizeTelegramRoute(botName: string, chatId: string, text: string) {
  return postJson<TelegramAuthorizationResult>("/api/telegram/authorize", {
    bot_name: botName,
    chat_id: chatId,
    text,
  });
}
