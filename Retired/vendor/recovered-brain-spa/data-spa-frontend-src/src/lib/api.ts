import { refreshToken } from "@/lib/auth";
import type {
  AssistantSuggestionResponse,
  EvidenceSummary,
  GenerationJob,
  PersonaFieldState,
  PersonaPageData,
  PersonaStatusData,
  PublishedBundle,
  ProjectBrief,
  ProjectSettingsResponse,
  ProjectUiPreference,
  ProjectSetupGenerationRequest,
  ProjectSetupGenerationResponse,
  ProjectSummary,
  RunDetail,
  RunSummary,
  RunsPageData,
  SessionInfo,
  TranscriptSummary,
  TranscriptsPageData,
  WorkerStatus,
} from "@/lib/types";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokenSingleFlight(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshToken()
      .then((status) => status === "refreshed")
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const attempt = async (): Promise<Response> =>
    fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

  let response = await attempt();
  if (response.status === 401) {
    const refreshed = await refreshTokenSingleFlight();
    if (refreshed) {
      response = await attempt();
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(response.status, payload.detail || `Request failed: ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function uploadRequest<T>(url: string, body: FormData): Promise<T> {
  const attempt = async (): Promise<Response> =>
    fetch(url, {
      method: "POST",
      body,
      credentials: "include",
    });

  let response = await attempt();
  if (response.status === 401) {
    const refreshed = await refreshTokenSingleFlight();
    if (refreshed) {
      response = await attempt();
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(response.status, payload.detail || "Upload failed");
  }
  return response.json() as Promise<T>;
}

function sendKeepaliveJson(url: string, payload: unknown): void {
  void fetch(url, {
    method: "PATCH",
    credentials: "include",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>("/api/projects");
}

export async function createProject(payload: {
  name: string;
  description: string;
  learning_goal?: string;
  brief?: ProjectBrief;
}): Promise<ProjectSummary> {
  return request<ProjectSummary>("/api/projects", { method: "POST", body: JSON.stringify(payload) });
}

export async function generateProjectSetup(
  payload: ProjectSetupGenerationRequest
): Promise<ProjectSetupGenerationResponse> {
  return request<ProjectSetupGenerationResponse>("/api/project-setup/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getProjectSettings(projectId: number): Promise<ProjectSettingsResponse> {
  return request<ProjectSettingsResponse>(`/api/projects/${projectId}/settings`);
}

export async function updateProjectSettings(
  projectId: number,
  payload: { name: string; description: string }
): Promise<ProjectSettingsResponse> {
  return request<ProjectSettingsResponse>(`/api/projects/${projectId}/settings`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function flushProjectSettingsKeepalive(projectId: number, payload: { name: string; description: string }): void {
  sendKeepaliveJson(`/api/projects/${projectId}/settings`, payload);
}

export async function getProjectPersona(projectId: number): Promise<PersonaPageData> {
  return request<PersonaPageData>(`/api/projects/${projectId}/persona`);
}

export async function getProjectPersonaStatus(projectId: number): Promise<PersonaStatusData> {
  return request<PersonaStatusData>(`/api/projects/${projectId}/persona/status`);
}

export async function updateProjectPreference(
  projectId: number,
  payload: ProjectUiPreference
): Promise<ProjectUiPreference> {
  return request<ProjectUiPreference>(`/api/projects/${projectId}/preferences`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updatePersonaField(
  projectId: number,
  fieldKey: string,
  payload: { value: string }
): Promise<PersonaFieldState> {
  return request<PersonaFieldState>(`/api/projects/${projectId}/persona/${fieldKey}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function flushPersonaFieldKeepalive(projectId: number, fieldKey: string, payload: { value: string }): void {
  sendKeepaliveJson(`/api/projects/${projectId}/persona/${fieldKey}`, payload);
}

export async function generatePersonaField(
  projectId: number,
  payload: { field_key: string }
): Promise<GenerationJob> {
  return request<GenerationJob>(`/api/projects/${projectId}/persona/generate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getProjectTranscripts(
  projectId: number,
  options?: { limit?: number; offset?: number }
): Promise<TranscriptsPageData> {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }
  if (typeof options?.offset === "number") {
    params.set("offset", String(options.offset));
  }
  const query = params.size ? `?${params.toString()}` : "";
  return request<TranscriptsPageData>(`/api/projects/${projectId}/transcripts${query}`);
}

export async function pasteTranscript(projectId: number, sourceName: string, text: string): Promise<TranscriptSummary> {
  return request<TranscriptSummary>(`/api/projects/${projectId}/transcripts/paste`, {
    method: "POST",
    body: JSON.stringify({ source_name: sourceName, text }),
  });
}

export async function uploadTranscript(projectId: number, file: File): Promise<TranscriptSummary> {
  const body = new FormData();
  body.append("file", file);
  return uploadRequest<TranscriptSummary>(`/api/projects/${projectId}/transcripts/upload`, body);
}

export async function updateTranscript(
  transcriptId: number,
  payload: { source_name: string; text: string }
): Promise<TranscriptSummary> {
  return request<TranscriptSummary>(`/api/transcripts/${transcriptId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function generateSyntheticTranscript(
  projectId: number,
  payload: { source_name: string; prompt: string }
): Promise<GenerationJob> {
  return request<GenerationJob>(`/api/projects/${projectId}/transcripts/generate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createEvidence(
  projectId: number,
  payload: {
    title: string;
    source_type: string;
    source_label: string;
    content_text: string;
    citation_url?: string | null;
    source_span?: string | null;
    trust_level: string;
    metadata?: Record<string, unknown>;
  }
): Promise<EvidenceSummary> {
  return request<EvidenceSummary>(`/api/projects/${projectId}/evidence`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveEvidence(evidenceId: number, approvalState: string): Promise<EvidenceSummary> {
  return request<EvidenceSummary>(`/api/evidence/${evidenceId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approval_state: approvalState }),
  });
}

export async function requestAssistantSuggestions(
  projectId: number,
  payload: { task: string; difficulty: "normal" | "deep"; persist_suggestions: boolean }
): Promise<AssistantSuggestionResponse> {
  return request<AssistantSuggestionResponse>(`/api/projects/${projectId}/assistant/suggest`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createRun(projectId: number, transcriptIds: number[] = []): Promise<RunSummary> {
  return request<RunSummary>(`/api/projects/${projectId}/runs`, {
    method: "POST",
    body: JSON.stringify({ transcript_ids: transcriptIds }),
  });
}

export async function getProjectRuns(
  projectId: number,
  options?: { limit?: number; offset?: number }
): Promise<RunsPageData> {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }
  if (typeof options?.offset === "number") {
    params.set("offset", String(options.offset));
  }
  const query = params.size ? `?${params.toString()}` : "";
  return request<RunsPageData>(`/api/projects/${projectId}/runs${query}`);
}

export async function getWorkerStatus(): Promise<WorkerStatus> {
  return request<WorkerStatus>("/api/worker/status");
}

export async function getRun(runId: number): Promise<RunDetail> {
  return request<RunDetail>(`/api/runs/${runId}`);
}

export async function getRunStatus(runId: number): Promise<RunSummary> {
  return request<RunSummary>(`/api/runs/${runId}/status`);
}

export async function publishRunBundle(runId: number): Promise<PublishedBundle> {
  return request<PublishedBundle>(`/api/runs/${runId}/publish-bundle`, { method: "POST" });
}

export async function listSessions(): Promise<SessionInfo[]> {
  return request<SessionInfo[]>("/api/auth/sessions");
}

export async function revokeAllSessions(): Promise<{ revoked_count: number }> {
  return request<{ revoked_count: number }>("/api/auth/sessions/revoke-all", { method: "POST" });
}
