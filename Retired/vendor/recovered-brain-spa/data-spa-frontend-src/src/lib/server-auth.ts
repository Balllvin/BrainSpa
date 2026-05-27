import type { ErrorStateVariant } from "@/lib/error-states";
import { ServerApiError } from "@/lib/server-api";
import type { MeResponse } from "@/lib/types";

const LOCAL_USER: MeResponse = {
  id: 1,
  email: "local@brain-spa",
  full_name: "Local workspace",
  created_at: "2001-01-01T00:00:00.000Z",
};

export interface ProtectedPageSession {
  user: MeResponse;
  nextPath: string;
  hasRefreshCookie: boolean;
}

export type SessionGuardResult =
  | { kind: "ready"; session: ProtectedPageSession }
  | { kind: "error"; variant: ErrorStateVariant };

export interface ProtectedPageErrorResult {
  kind: "error";
  variant: ErrorStateVariant;
  title?: string;
  detail?: string;
  primaryActionHref?: string;
  primaryActionLabel?: string;
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
}

export async function requireProtectedPage(nextPath: string): Promise<SessionGuardResult> {
  return {
    kind: "ready",
    session: {
      user: LOCAL_USER,
      nextPath,
      hasRefreshCookie: false,
    },
  };
}

export async function requireGuestPage(): Promise<SessionGuardResult | { kind: "render" }> {
  return {
    kind: "ready",
    session: {
      user: LOCAL_USER,
      nextPath: "/",
      hasRefreshCookie: false,
    },
  };
}

export function handleProtectedPageDataError(
  error: unknown,
  session: ProtectedPageSession
): ProtectedPageErrorResult {
  if (error instanceof ServerApiError) {
    return {
      kind: "error",
      variant: "backend-unavailable",
      title: "Request could not be completed.",
      detail: error.message,
      primaryActionHref: "/",
      primaryActionLabel: "Go to projects",
    };
  }
  return { kind: "error", variant: "backend-unavailable" };
}
