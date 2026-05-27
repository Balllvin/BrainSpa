import { cookies } from "next/headers";
import { cache } from "react";

import { BackendUrlConfigurationError, buildBackendUrl } from "@/lib/backend-url";
import type { SessionBootstrapResponse } from "@/lib/types";

export const AUTH_ACCESS_COOKIE_NAME = "trainer_access";
export const AUTH_REFRESH_COOKIE_NAME = "trainer_refresh";

export const getServerCookieHeader = cache(async function getServerCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
});

export const getServerSession = cache(async function getServerSession(): Promise<SessionBootstrapResponse> {
  const cookieHeader = await getServerCookieHeader();

  try {
    const response = await fetch(buildBackendUrl("/api/auth/bootstrap"), {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      return { resolved: true, auth_configured: true, user: null };
    }
    if (!response.ok) {
      return { resolved: false, auth_configured: false, user: null };
    }
    return response.json();
  } catch (error) {
    if (error instanceof BackendUrlConfigurationError) {
      return { resolved: false, auth_configured: false, user: null };
    }
    return { resolved: false, auth_configured: false, user: null };
  }
});
