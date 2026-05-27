import type { AuthResponse, MeResponse } from "@/lib/types";

export type MeStatus = "authenticated" | "unauthenticated" | "unavailable";
export type RefreshTokenStatus = "refreshed" | "unauthenticated" | "unavailable";

export interface MeCheckResult {
  status: MeStatus;
  user: MeResponse | null;
}

function logAuthClientError(operation: string, error: unknown): void {
  console.error(`[auth] ${operation} failed`, error);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Login failed");
  }
  return res.json();
}

export async function signup(email: string, password: string, fullName: string): Promise<AuthResponse> {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Signup failed");
  }
  return res.json();
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Sign out failed");
  }
  window.location.href = "/login";
}

export async function refreshToken(): Promise<RefreshTokenStatus> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    if (res.ok) {
      return "refreshed";
    }
    if (res.status === 401) {
      return "unauthenticated";
    }
    return "unavailable";
  } catch (error) {
    logAuthClientError("refreshToken", error);
    return "unavailable";
  }
}

export async function getMeStatus(): Promise<MeCheckResult> {
  try {
    let res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.status === 401) {
      const refreshStatus = await refreshToken();
      if (refreshStatus === "refreshed") {
        res = await fetch("/api/auth/me", { credentials: "include" });
      } else if (refreshStatus === "unauthenticated") {
        return { status: "unauthenticated", user: null };
      } else {
        return { status: "unavailable", user: null };
      }
    }
    if (res.status === 401) {
      return { status: "unauthenticated", user: null };
    }
    if (!res.ok) {
      return { status: "unavailable", user: null };
    }
    return { status: "authenticated", user: await res.json() };
  } catch (error) {
    logAuthClientError("getMeStatus", error);
    return { status: "unavailable", user: null };
  }
}

export async function getMe(): Promise<MeResponse | null> {
  return (await getMeStatus()).user;
}
