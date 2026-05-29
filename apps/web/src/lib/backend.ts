import type {
  AcceptanceRunResult,
  AdapterTestResult,
  HarnessChatSendResult,
  HarnessChatThread,
  TestScenario,
  AgentBackendKey,
  AppSettings,
  BrainSpaOverview,
  ChipmunkChatResult,
  ChipmunkTranscribeResult,
  ConnectStreamEvent,
  DatasetProfile,
  DatasetEvidenceGate,
  DatasetGenerateResult,
  DatasetGenerateOptions,
  DatasetImportFeedbackResult,
  DatasetPreferencePairCreate,
  DatasetPreferencePairResult,
  DatasetRow,
  DatasetRowCreate,
  DatasetRowPage,
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
  TrainingPreset,
  TuneBuildJob,
  TuneBuildPreview,
  TuneModelStatus,
  TuneStatusResponse,
  TelegramPollResult,
  TelegramPollerStatus,
  WorkerRunResult,
  EvidenceApprovedClaimsResponse,
  EvidenceBulkApproveResult,
  EvidenceClaim,
  EvidenceClaimCreate,
  EvidenceIngestResult,
  EvidenceModelSummary,
  EvidenceNotes,
  EvidenceSourceDetail,
  EvidenceSourceSummary,
  EvidenceClaimStatus,
} from "@/lib/types";

const DEFAULT_BACKEND = "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 8000;
const MODEL_REQUEST_TIMEOUT_MS = 300_000;

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

export async function fetchDatasetEvidenceGate(): Promise<{
  ok: boolean;
  gate: DatasetEvidenceGate | null;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl("/api/datasets/evidence-gate"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, gate: null, error: `Could not load evidence gate (${response.status})` };
    }
    return { ok: true, gate: (await response.json()) as DatasetEvidenceGate, error: null };
  } catch {
    return { ok: false, gate: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export async function fetchDatasetScenarios(): Promise<{
  ok: boolean;
  scenarios: TestScenario[];
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl("/api/datasets/scenarios"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, scenarios: [], error: `Could not load scenarios (${response.status})` };
    }
    return { ok: true, scenarios: (await response.json()) as TestScenario[], error: null };
  } catch {
    return { ok: false, scenarios: [], error: "Backend is offline. Start it with npm run api." };
  }
}

export async function generateDatasetForKey(
  datasetKey: string,
  options: Partial<DatasetGenerateOptions> & { example_count?: number } = {},
): Promise<{ ok: boolean; data: DatasetGenerateResult | null; error: string | null }> {
  const payload: DatasetGenerateOptions = {
    example_count: options.example_count ?? 24,
    scenarios: options.scenarios ?? ["counsel", "advice", "witness", "daily-word"],
    scenario_weights: options.scenario_weights ?? {},
    mix_even: options.mix_even ?? true,
    ground_in_evidence: options.ground_in_evidence ?? true,
    preview_only: options.preview_only ?? false,
    pack: options.pack ?? null,
  };
  try {
    const response = await fetch(backendUrl(`/api/datasets/${encodeURIComponent(datasetKey)}/generate`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let detail = `Backend rejected request (${response.status})`;
      try {
        const body = (await response.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        /* ignore */
      }
      return { ok: false, data: null, error: detail };
    }
    return { ok: true, data: (await response.json()) as DatasetGenerateResult, error: null };
  } catch {
    return { ok: false, data: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export function createDatasetRow(datasetKey: string, body: DatasetRowCreate) {
  return postJson<DatasetRow>(`/api/datasets/${encodeURIComponent(datasetKey)}/rows`, body);
}

export function createDatasetPreferencePair(datasetKey: string, body: DatasetPreferencePairCreate) {
  return postJson<DatasetPreferencePairResult>(
    `/api/datasets/${encodeURIComponent(datasetKey)}/preference-pairs`,
    body,
  );
}

export async function fetchDatasetRows(
  datasetKey: string,
  offset = 0,
  limit = 50,
): Promise<{ ok: boolean; page: DatasetRowPage | null; error: string | null }> {
  try {
    const response = await fetch(
      backendUrl(
        `/api/datasets/${encodeURIComponent(datasetKey)}/rows?offset=${offset}&limit=${limit}`,
      ),
      { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!response.ok) {
      return { ok: false, page: null, error: `Could not load rows (${response.status})` };
    }
    return { ok: true, page: (await response.json()) as DatasetRowPage, error: null };
  } catch {
    return { ok: false, page: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export function patchDatasetRow(
  datasetKey: string,
  rowId: string,
  patch: { user_prompt?: string; assistant_answer?: string; failure_labels?: string[] },
) {
  return postJson<DatasetRow>(
    `/api/datasets/${encodeURIComponent(datasetKey)}/rows/${encodeURIComponent(rowId)}`,
    patch,
    "PATCH",
  );
}

export function deleteDatasetRow(datasetKey: string, rowId: string) {
  return postJson<{ ok: boolean }>(
    `/api/datasets/${encodeURIComponent(datasetKey)}/rows/${encodeURIComponent(rowId)}`,
    {},
    "DELETE",
  );
}

export function importDatasetTestFeedback(datasetKey: string) {
  return postJson<DatasetImportFeedbackResult>(
    `/api/datasets/${encodeURIComponent(datasetKey)}/import-test-feedback`,
    {},
  );
}

export async function fetchTuneStatus(): Promise<{
  ok: boolean;
  data: TuneStatusResponse | null;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl("/api/tune/status"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, data: null, error: `Could not load tune status (${response.status})` };
    }
    return { ok: true, data: (await response.json()) as TuneStatusResponse, error: null };
  } catch {
    return { ok: false, data: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export async function fetchTuneModelStatus(modelSlug: string): Promise<{
  ok: boolean;
  status: TuneModelStatus | null;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl(`/api/tune/${encodeURIComponent(modelSlug)}/status`), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, status: null, error: `Could not load status (${response.status})` };
    }
    return { ok: true, status: (await response.json()) as TuneModelStatus, error: null };
  } catch {
    return { ok: false, status: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export function runTrainingDryRun(modelKey = "persona_small", datasetKey = "believer_seed") {
  return postJson<TrainingDryRunResult>("/api/tune/dry-run", { model_key: modelKey, dataset_key: datasetKey });
}

export async function fetchTuneBuildPreview(
  modelSlug: string,
  datasetKey?: string,
): Promise<{ ok: boolean; preview: TuneBuildPreview | null; error: string | null }> {
  try {
    const query = datasetKey ? `?dataset_key=${encodeURIComponent(datasetKey)}` : "";
    const response = await fetch(
      backendUrl(`/api/tune/${encodeURIComponent(modelSlug)}/build-preview${query}`),
      { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!response.ok) {
      return { ok: false, preview: null, error: `Could not load build preview (${response.status})` };
    }
    return { ok: true, preview: (await response.json()) as TuneBuildPreview, error: null };
  } catch {
    return { ok: false, preview: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export async function fetchTuneBuildJob(modelSlug: string): Promise<{
  ok: boolean;
  job: TuneBuildJob | null;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl(`/api/tune/${encodeURIComponent(modelSlug)}/build-job`), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, job: null, error: `Could not load build status (${response.status})` };
    }
    return { ok: true, job: (await response.json()) as TuneBuildJob, error: null };
  } catch {
    return { ok: false, job: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export function startTuneBuild(
  modelKey = "persona_small",
  datasetKey = "believer_seed",
  trainingPreset: TrainingPreset = "standard",
) {
  return postJson<TuneBuildJob>("/api/tune/build", {
    model_key: modelKey,
    dataset_key: datasetKey,
    training_preset: trainingPreset,
  });
}

/** @deprecated Use startTuneBuild + fetchTuneBuildJob polling */
export function buildTrainingAdapter(
  modelKey = "persona_small",
  datasetKey = "believer_seed",
  trainingPreset: TrainingPreset = "standard",
) {
  return startTuneBuild(modelKey, datasetKey, trainingPreset);
}

async function postJsonWithTimeout<T>(
  path: string,
  payload: unknown,
  timeoutMs: number,
  method = "POST",
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  try {
    const response = await fetch(backendUrl(path), {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { ok: false, data: null, error: `Backend rejected request (${response.status})` };
    }
    return { ok: true, data: (await response.json()) as T, error: null };
  } catch {
    return { ok: false, data: null, error: "Backend is offline or the model request timed out. Start npm run api." };
  }
}

export function testTrainingAdapter(prompt: string, modelKey = "persona_small") {
  return postJsonWithTimeout<AdapterTestResult>(
    "/api/tune/test-adapter",
    { prompt, model_key: modelKey },
    MODEL_REQUEST_TIMEOUT_MS,
  );
}

export async function fetchTestScenarios(modelKey: string): Promise<{
  ok: boolean;
  scenarios: TestScenario[];
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl(`/api/harness/scenarios/${encodeURIComponent(modelKey)}`), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, scenarios: [], error: `Could not load scenarios (${response.status})` };
    }
    return { ok: true, scenarios: (await response.json()) as TestScenario[], error: null };
  } catch {
    return { ok: false, scenarios: [], error: "Backend is offline. Start it with npm run api." };
  }
}

export async function fetchHarnessChat(
  modelKey: string,
  scenarioKey: string,
): Promise<{
  ok: boolean;
  thread: HarnessChatThread | null;
  error: string | null;
}> {
  try {
    const response = await fetch(
      backendUrl(
        `/api/harness/chat/${encodeURIComponent(modelKey)}/${encodeURIComponent(scenarioKey)}`,
      ),
      {
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return { ok: false, thread: null, error: `Could not load chat (${response.status})` };
    }
    return { ok: true, thread: (await response.json()) as HarnessChatThread, error: null };
  } catch {
    return { ok: false, thread: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export function sendHarnessChatMessage(
  modelKey: string,
  scenarioKey: string,
  text: string,
  replyToMessageId?: number | null,
) {
  return postJsonWithTimeout<HarnessChatSendResult>(
    "/api/harness/chat/send",
    {
      model_key: modelKey,
      scenario_key: scenarioKey,
      text,
      reply_to_message_id: replyToMessageId ?? null,
    },
    MODEL_REQUEST_TIMEOUT_MS,
  );
}

export function runBelieverAcceptance(modelKey = "persona_small") {
  return postJsonWithTimeout<AcceptanceRunResult>(
    "/api/tune/acceptance",
    { model_key: modelKey },
    MODEL_REQUEST_TIMEOUT_MS,
  );
}

export function runEval(environmentKey: string, answer: string, workspaceHint?: string, prompt?: string) {
  return postJson<EvalRunResult>("/api/evals/run", {
    environment_key: environmentKey,
    answer,
    workspace_hint: workspaceHint,
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

export async function fetchTelegramPollerStatus(): Promise<{
  ok: boolean;
  status: TelegramPollerStatus | null;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl("/api/telegram/poller/status"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, status: null, error: `Status failed (${response.status})` };
    return { ok: true, status: (await response.json()) as TelegramPollerStatus, error: null };
  } catch {
    return { ok: false, status: null, error: "Backend offline." };
  }
}

export function startTelegramPoller() {
  return postJson<TelegramPollerStatus>("/api/telegram/poller/start", {});
}

export function stopTelegramPoller() {
  return postJson<TelegramPollerStatus>("/api/telegram/poller/stop", {});
}

export function pollTelegramOnce() {
  return postJson<TelegramPollResult>("/api/telegram/poller/poll-once", {});
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

export async function fetchEvidenceModelSummary(modelSlug: string): Promise<{
  ok: boolean;
  summary: EvidenceModelSummary | null;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl(`/api/evidence/models/${encodeURIComponent(modelSlug)}`), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, summary: null, error: `Could not load model summary (${response.status})` };
    }
    return { ok: true, summary: (await response.json()) as EvidenceModelSummary, error: null };
  } catch {
    return { ok: false, summary: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export async function fetchEvidenceClaims(options: {
  model?: string;
  status?: EvidenceClaimStatus;
  sourceKey?: string;
}): Promise<{
  ok: boolean;
  claims: EvidenceClaim[];
  error: string | null;
}> {
  const params = new URLSearchParams();
  if (options.model) params.set("model", options.model);
  if (options.status) params.set("status", options.status);
  if (options.sourceKey) params.set("source_key", options.sourceKey);
  const query = params.toString();
  try {
    const response = await fetch(backendUrl(`/api/evidence/claims${query ? `?${query}` : ""}`), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, claims: [], error: `Could not load claims (${response.status})` };
    }
    return { ok: true, claims: (await response.json()) as EvidenceClaim[], error: null };
  } catch {
    return { ok: false, claims: [], error: "Backend is offline. Start it with npm run api." };
  }
}

export function createEvidenceClaim(body: EvidenceClaimCreate) {
  return postJson<EvidenceClaim>("/api/evidence/claims", body);
}

export function updateEvidenceClaim(
  claimId: string,
  patch: { status?: EvidenceClaimStatus; text?: string; citation?: string },
) {
  return postJson<EvidenceClaim>(`/api/evidence/claims/${encodeURIComponent(claimId)}`, patch, "PATCH");
}

export function deleteEvidenceClaim(claimId: string) {
  return postJson<{ ok: boolean }>(`/api/evidence/claims/${encodeURIComponent(claimId)}`, {}, "DELETE");
}

export function bulkApproveEvidenceClaims(model?: string) {
  const query = model ? `?model=${encodeURIComponent(model)}` : "";
  return postJson<EvidenceBulkApproveResult>(`/api/evidence/claims/bulk-approve${query}`, {});
}

export async function fetchEvidenceSources(): Promise<{
  ok: boolean;
  sources: EvidenceSourceSummary[];
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl("/api/evidence/sources"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, sources: [], error: `Could not load sources (${response.status})` };
    }
    return { ok: true, sources: (await response.json()) as EvidenceSourceSummary[], error: null };
  } catch {
    return { ok: false, sources: [], error: "Backend is offline. Start it with npm run api." };
  }
}

export async function fetchEvidenceNotes(): Promise<{
  ok: boolean;
  notes: EvidenceNotes | null;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl("/api/evidence/notes"), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, notes: null, error: `Could not load notes (${response.status})` };
    }
    return { ok: true, notes: (await response.json()) as EvidenceNotes, error: null };
  } catch {
    return { ok: false, notes: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export async function fetchEvidenceSourceDetail(sourceKey: string): Promise<{
  ok: boolean;
  detail: EvidenceSourceDetail | null;
  error: string | null;
}> {
  try {
    const response = await fetch(backendUrl(`/api/evidence/sources/${encodeURIComponent(sourceKey)}`), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, detail: null, error: `Source not found (${response.status})` };
    }
    return { ok: true, detail: (await response.json()) as EvidenceSourceDetail, error: null };
  } catch {
    return { ok: false, detail: null, error: "Backend is offline. Start it with npm run api." };
  }
}

export function startEvidenceIngest(sourceKey: string, query?: string) {
  return postJsonWithTimeout<EvidenceIngestResult>(
    `/api/evidence/sources/${encodeURIComponent(sourceKey)}/ingest`,
    { query: query ?? null },
    MODEL_REQUEST_TIMEOUT_MS,
  );
}

export function patchEvidenceClaim(claimId: string, status: EvidenceClaimStatus, note?: string) {
  return postJson<EvidenceClaim>(
    `/api/evidence/claims/${encodeURIComponent(claimId)}`,
    { status, note: note ?? null },
    "PATCH",
  );
}

export async function fetchApprovedEvidenceClaims(sourceKey?: string): Promise<{
  ok: boolean;
  data: EvidenceApprovedClaimsResponse | null;
  error: string | null;
}> {
  const query = sourceKey ? `?source_key=${encodeURIComponent(sourceKey)}` : "";
  try {
    const response = await fetch(backendUrl(`/api/evidence/approved-claims${query}`), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, data: null, error: `Could not load approved claims (${response.status})` };
    }
    return { ok: true, data: (await response.json()) as EvidenceApprovedClaimsResponse, error: null };
  } catch {
    return { ok: false, data: null, error: "Backend is offline. Start it with npm run api." };
  }
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
