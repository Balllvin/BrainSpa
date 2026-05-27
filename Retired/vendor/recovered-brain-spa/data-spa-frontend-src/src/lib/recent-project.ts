import type { ProjectSummary } from "@/lib/types";

export const RECENT_PROJECT_STORAGE_KEY = "recent-project";
export const RECENT_PROJECT_EVENT = "data-spa:recent-project";

const PROJECT_SECTION_LABELS: Record<string, string> = {
  persona: "Persona",
  transcripts: "Transcripts",
  runs: "Runs",
};

export interface RecentProjectLocation {
  projectId: number;
  projectName: string;
  href: string;
  sectionLabel: string;
}

interface ProjectRouteMatch {
  projectId: number;
  href: string;
  sectionKey: string;
}

function isRecentProjectLocation(value: unknown): value is RecentProjectLocation {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.projectId === "number" &&
    Number.isFinite(candidate.projectId) &&
    candidate.projectId > 0 &&
    typeof candidate.projectName === "string" &&
    candidate.projectName.trim().length > 0 &&
    typeof candidate.href === "string" &&
    candidate.href.startsWith("/projects/") &&
    typeof candidate.sectionLabel === "string" &&
    candidate.sectionLabel.trim().length > 0
  );
}

function getSectionLabel(sectionKey: string): string {
  return PROJECT_SECTION_LABELS[sectionKey] || "Workspace";
}

function clearStoredRecentProject(): void {
  try {
    window.localStorage.removeItem(RECENT_PROJECT_STORAGE_KEY);
  } catch {
    // Ignore cleanup failures when storage access itself is unavailable.
  }
}

function warnRecentProjectStorage(operation: string, error: unknown): void {
  console.warn(`[recent-project] ${operation} failed`, error);
}

export function parseProjectPathname(pathname: string): ProjectRouteMatch | null {
  if (!pathname || typeof pathname !== "string") {
    return null;
  }

  const match = pathname.match(/^\/projects\/(\d+)(?:\/([^/?#]+))?/);
  if (!match) {
    return null;
  }

  const projectId = Number(match[1]);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return null;
  }

  const sectionKey = match[2] || "persona";
  return {
    projectId,
    href: `/projects/${projectId}/${sectionKey}`,
    sectionKey,
  };
}

export function getProjectSectionLabel(pathname: string): string {
  const match = parseProjectPathname(pathname);
  if (!match) {
    return "Project";
  }
  return getSectionLabel(match.sectionKey);
}

export function loadRecentProject(): RecentProjectLocation | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(RECENT_PROJECT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecentProjectLocation(parsed)) {
      clearStoredRecentProject();
      return null;
    }
    return parsed;
  } catch (error) {
    warnRecentProjectStorage("load", error);
    clearStoredRecentProject();
    return null;
  }
}

export function saveRecentProject(project: Pick<ProjectSummary, "id" | "name">, pathname: string): RecentProjectLocation | null {
  if (typeof window === "undefined") {
    return null;
  }

  const match = parseProjectPathname(pathname);
  if (!match) {
    return null;
  }

  const next: RecentProjectLocation = {
    projectId: match.projectId,
    projectName: project.name.trim() || `Project ${project.id}`,
    href: match.href,
    sectionLabel: getSectionLabel(match.sectionKey),
  };

  try {
    window.localStorage.setItem(RECENT_PROJECT_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    warnRecentProjectStorage("save", error);
  }

  window.dispatchEvent(new CustomEvent(RECENT_PROJECT_EVENT, { detail: next }));
  return next;
}
