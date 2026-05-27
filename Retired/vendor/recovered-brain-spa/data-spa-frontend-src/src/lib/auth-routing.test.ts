import { describe, expect, it } from "vitest";

import { buildLoginPath, getGuestSessionDecision, getProtectedSessionDecision, normalizeNextPath } from "@/lib/auth-routing";
import type { SessionBootstrapResponse } from "@/lib/types";

function buildSession(overrides: Partial<SessionBootstrapResponse> = {}): SessionBootstrapResponse {
  return {
    resolved: true,
    auth_configured: true,
    user: {
      id: 1,
      email: "user@example.com",
      full_name: "Test User",
      created_at: "2026-04-17T18:00:00Z",
    },
    ...overrides,
  };
}

describe("normalizeNextPath", () => {
  it("keeps safe relative paths", () => {
    expect(normalizeNextPath("/projects/42?tab=brief")).toBe("/projects/42?tab=brief");
  });

  it("falls back for unsafe paths", () => {
    expect(normalizeNextPath("https://example.com")).toBe("/");
    expect(normalizeNextPath("//evil.example")).toBe("/");
  });
});

describe("getProtectedSessionDecision", () => {
  it("allows valid sessions", () => {
    const decision = getProtectedSessionDecision({
      session: buildSession(),
      hasRefreshCookie: true,
      nextPath: "/",
    });

    expect(decision.kind).toBe("allow");
  });

  it("redirects expired access with refresh cookie to refresh route", () => {
    const decision = getProtectedSessionDecision({
      session: buildSession({ user: null }),
      hasRefreshCookie: true,
      nextPath: "/settings",
    });

    expect(decision).toEqual({
      kind: "redirect",
      location: "/auth/refresh?next=%2Fsettings",
    });
  });

  it("redirects missing session without refresh cookie to login", () => {
    const decision = getProtectedSessionDecision({
      session: buildSession({ user: null }),
      hasRefreshCookie: false,
      nextPath: "/runs/7",
    });

    expect(decision).toEqual({
      kind: "redirect",
      location: buildLoginPath("/runs/7"),
    });
  });

  it("returns backend unavailable instead of login when bootstrap fails", () => {
    const decision = getProtectedSessionDecision({
      session: buildSession({ resolved: false, auth_configured: false, user: null }),
      hasRefreshCookie: true,
      nextPath: "/",
    });

    expect(decision).toEqual({
      kind: "error",
      variant: "backend-unavailable",
    });
  });

  it("keeps auth-misconfigured reserved for explicit backend signals", () => {
    const decision = getProtectedSessionDecision({
      session: buildSession({ resolved: false, auth_configured: true, user: null }),
      hasRefreshCookie: true,
      nextPath: "/",
    });

    expect(decision).toEqual({
      kind: "error",
      variant: "auth-misconfigured",
    });
  });
});

describe("getGuestSessionDecision", () => {
  it("redirects authenticated users away from auth pages", () => {
    const decision = getGuestSessionDecision({
      session: buildSession(),
      hasRefreshCookie: true,
      authenticatedRedirectTo: "/",
    });

    expect(decision).toEqual({
      kind: "redirect",
      location: "/",
    });
  });
});
