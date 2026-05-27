import type { MeResponse, SessionBootstrapResponse } from "@/lib/types";
import type { ErrorStateVariant } from "@/lib/error-states";

export interface ProtectedSessionDecisionInput {
  session: SessionBootstrapResponse;
  hasRefreshCookie: boolean;
  nextPath: string;
}

export interface GuestSessionDecisionInput {
  session: SessionBootstrapResponse;
  hasRefreshCookie: boolean;
  authenticatedRedirectTo?: string;
}

export type ProtectedSessionDecision =
  | { kind: "allow"; user: MeResponse }
  | { kind: "redirect"; location: string }
  | { kind: "error"; variant: ErrorStateVariant };

export type GuestSessionDecision =
  | { kind: "render" }
  | { kind: "redirect"; location: string }
  | { kind: "error"; variant: ErrorStateVariant };

export function normalizeNextPath(nextPath: string | null | undefined): string {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/";
  }

  try {
    const parsed = new URL(nextPath, "http://localhost");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export function buildRefreshPath(nextPath: string): string {
  const safeNextPath = normalizeNextPath(nextPath);
  return `/auth/refresh?next=${encodeURIComponent(safeNextPath)}`;
}

export function buildLoginPath(nextPath: string): string {
  const safeNextPath = normalizeNextPath(nextPath);
  return `/login?next=${encodeURIComponent(safeNextPath)}`;
}

export function buildAuthUnavailablePath(nextPath: string, variant: ErrorStateVariant = "backend-unavailable"): string {
  const safeNextPath = normalizeNextPath(nextPath);
  return `/auth/unavailable?next=${encodeURIComponent(safeNextPath)}&variant=${encodeURIComponent(variant)}`;
}

export function getSessionFailureVariant(session: SessionBootstrapResponse): ErrorStateVariant {
  return session.auth_configured ? "auth-misconfigured" : "backend-unavailable";
}

export function getProtectedSessionDecision({
  session,
  hasRefreshCookie,
  nextPath,
}: ProtectedSessionDecisionInput): ProtectedSessionDecision {
  if (!session.resolved) {
    return { kind: "error", variant: getSessionFailureVariant(session) };
  }
  if (session.user) {
    return { kind: "allow", user: session.user };
  }
  if (hasRefreshCookie) {
    return { kind: "redirect", location: buildRefreshPath(nextPath) };
  }
  return { kind: "redirect", location: buildLoginPath(nextPath) };
}

export function getGuestSessionDecision({
  session,
  hasRefreshCookie,
  authenticatedRedirectTo = "/",
}: GuestSessionDecisionInput): GuestSessionDecision {
  const redirectTarget = normalizeNextPath(authenticatedRedirectTo);

  if (!session.resolved) {
    return { kind: "error", variant: getSessionFailureVariant(session) };
  }
  if (session.user) {
    return { kind: "redirect", location: redirectTarget };
  }
  if (hasRefreshCookie) {
    return { kind: "redirect", location: buildRefreshPath(redirectTarget) };
  }
  return { kind: "render" };
}
