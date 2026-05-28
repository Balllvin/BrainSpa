import type {
  AdapterTestResult,
  AgentBackendKey,
  AppSettings,
  BrainSpaOverview,
  ChipmunkChatResult,
  ChipmunkTranscribeResult,
  ConnectStreamEvent,
  DatasetProfile,
  DatasetGenerateResult,
  EvalRunResult,
  HermesSetup,
  LoopAgentSettings,
  LoopStageKey,
  ModelProfile,
  ModelTelegramLink,
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

async function postJson<T>(
  path: string,
  payload: unknown,
  method = "POST",
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  try {
    const response = await fetch(backendUrl(path), {
      method,
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

export function runTrainingDryRun(modelKey = "persona_small", datasetKey = "believer_seed") {
  return postJson<TrainingDryRunResult>("/api/training/dry-run", { model_key: modelKey, dataset_key: datasetKey });
}

export function buildTrainingAdapter(modelKey = "persona_small", datasetKey = "believer_seed") {
  return postJson<TrainingAdapterBuildResult>("/api/training/build-adapter", {
    model_key: modelKey,
    dataset_key: datasetKey,
  });
}

export function testTrainingAdapter(prompt: string, modelKey = "persona_small") {
  return postJson<AdapterTestResult>("/api/training/test-adapter", { prompt, model_key: modelKey });
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

export async function transcribeVoiceNote(
  blob: Blob,
): Promise<{ ok: boolean; text: string | null; error: string | null }> {
  const form = new FormData();
  form.append("audio", blob, "voice-note.webm");
  try {
    const response = await fetch(backendUrl("/api/chipmunk/transcribe"), {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      let detail = `Transcription failed (${response.status})`;
      try {
        const body = (await response.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        /* ignore */
      }
      return { ok: false, text: null, error: detail };
    }
    const data = (await response.json()) as ChipmunkTranscribeResult;
    return { ok: true, text: data.text, error: null };
  } catch {
    return { ok: false, text: null, error: "Backend offline or transcription timed out. Run npm run api." };
  }
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

export async function fetchApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(backendUrl("/api/health"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchAppSettings(): Promise<{
  ok: boolean;
  settings: AppSettings | null;
  needsRestart: boolean;
}> {
  const online = await fetchApiHealth();
  if (!online) {
    return { ok: false, settings: null, needsRestart: false };
  }
  try {
    const response = await fetch(backendUrl("/api/settings"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) {
      return { ok: false, settings: null, needsRestart: true };
    }
    if (!response.ok) {
      return { ok: false, settings: null, needsRestart: false };
    }
    return { ok: true, settings: (await response.json()) as AppSettings, needsRestart: false };
  } catch {
    return { ok: false, settings: null, needsRestart: false };
  }
}

export function updateLoopAgent(
  stageKey: LoopStageKey,
  patch: { backend?: AgentBackendKey; telegram_bot_name?: string | null },
) {
  return postJson<LoopAgentSettings>(`/api/settings/loop/${stageKey}`, patch, "PATCH");
}

export function updateModelTelegram(modelKey: string, telegramBotName: string | null) {
  return postJson<ModelTelegramLink>(`/api/settings/models/${modelKey}/telegram`, {
    telegram_bot_name: telegramBotName,
  }, "PATCH");
}

export async function connectBackendQuick(
  backendKey: AgentBackendKey,
): Promise<{ ok: boolean; connected: boolean; needsStream: boolean; error: string | null }> {
  try {
    const response = await fetch(backendUrl(`/api/backends/${backendKey}/connect`), {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, connected: false, needsStream: false, error: `Connect failed (${response.status})` };
    }
    const data = (await response.json()) as { connected?: boolean; needs_stream?: boolean };
    return {
      ok: true,
      connected: Boolean(data.connected),
      needsStream: Boolean(data.needs_stream),
      error: null,
    };
  } catch {
    return { ok: false, connected: false, needsStream: false, error: "Backend is offline." };
  }
}

export function streamBackendConnect(
  backendKey: AgentBackendKey,
  onEvent: (event: ConnectStreamEvent) => void,
): () => void {
  const source = new EventSource(backendUrl(`/api/backends/${backendKey}/connect/stream`));
  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as ConnectStreamEvent;
      onEvent(event);
      if (event.type === "done" || event.type === "error") {
        source.close();
      }
    } catch {
      onEvent({ type: "error", message: "Could not read install stream." });
      source.close();
    }
  };
  source.onerror = () => {
    onEvent({ type: "error", message: "Install stream disconnected." });
    source.close();
  };
  return () => source.close();
}

export function markBackendAuthComplete(backendKey: AgentBackendKey) {
  return postJson<{ ok: boolean }>(`/api/backends/${backendKey}/auth/complete`, {});
}

export async function importLegacyTelegramBots(): Promise<{
  ok: boolean;
  imported: number;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl("/api/telegram/import-legacy"), { method: "POST" });
    if (!response.ok) {
      return { ok: false, imported: 0, error: `Import failed (${response.status})` };
    }
    const data = (await response.json()) as { imported?: number };
    return { ok: true, imported: data.imported ?? 0, error: null };
  } catch {
    return { ok: false, imported: 0, error: "Backend offline." };
  }
}

export function patchChipmunkSettings(patch: {
  xai_api_key?: string;
  default_model_key?: string;
  default_telegram_bot_name?: string | null;
  voice_model?: string;
  clear_xai_api_key?: boolean;
}) {
  return postJson<import("@/lib/types").ChipmunkSettings>("/api/settings/chipmunk", patch, "PATCH");
}

export async function fetchChipmunkVoiceSecret(): Promise<{
  ok: boolean;
  token: string | null;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl("/api/chipmunk/voice/client-secret"), { method: "POST" });
    if (!response.ok) {
      let detail = `Voice session failed (${response.status})`;
      try {
        const body = (await response.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        /* ignore */
      }
      return { ok: false, token: null, error: detail };
    }
    const data = (await response.json()) as { client_secret?: { value?: string }; value?: string };
    const token = data.client_secret?.value ?? data.value ?? null;
    return { ok: Boolean(token), token, error: token ? null : "No client secret in response." };
  } catch {
    return { ok: false, token: null, error: "Backend offline." };
  }
}
