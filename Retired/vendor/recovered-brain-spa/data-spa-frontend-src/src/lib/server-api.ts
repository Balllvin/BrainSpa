import type {
  PersonaPageData,
  ProjectDetail,
  ProjectSettingsResponse,
  ProjectSummary,
  RunDetail,
  RunsPageData,
  SessionInfo,
  TranscriptsPageData,
} from "@/lib/types";
import { BackendUrlConfigurationError, buildBackendUrl } from "@/lib/backend-url";
import { getServerCookieHeader } from "@/lib/server-session";

export class ServerApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function serverRequest<T>(path: string): Promise<T> {
  const cookieHeader = await getServerCookieHeader();
  let response: Response;
  try {
    response = await fetch(buildBackendUrl(path), {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof BackendUrlConfigurationError) {
      throw new ServerApiError(503, error.message);
    }
    throw new ServerApiError(503, "The frontend could not reach the backend service.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ServerApiError(response.status, payload.detail || `Server request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function listProjectsServer(): Promise<ProjectSummary[]> {
  return serverRequest<ProjectSummary[]>("/api/projects");
}

export function getProjectServer(projectId: number): Promise<ProjectDetail> {
  return serverRequest<ProjectDetail>(`/api/projects/${projectId}`);
}

export function getProjectSettingsServer(projectId: number): Promise<ProjectSettingsResponse> {
  return serverRequest<ProjectSettingsResponse>(`/api/projects/${projectId}/settings`);
}

export function getProjectPersonaServer(projectId: number): Promise<PersonaPageData> {
  return serverRequest<PersonaPageData>(`/api/projects/${projectId}/persona`);
}

export function getProjectTranscriptsServer(projectId: number): Promise<TranscriptsPageData> {
  return serverRequest<TranscriptsPageData>(`/api/projects/${projectId}/transcripts`);
}

export function getProjectRunsServer(projectId: number): Promise<RunsPageData> {
  return serverRequest<RunsPageData>(`/api/projects/${projectId}/runs`);
}

export function getRunServer(runId: number): Promise<RunDetail> {
  return serverRequest<RunDetail>(`/api/runs/${runId}`);
}

export function listSessionsServer(): Promise<SessionInfo[]> {
  return serverRequest<SessionInfo[]>("/api/auth/sessions");
}
