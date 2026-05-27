import { NextRequest, NextResponse } from "next/server";

import { buildAuthUnavailablePath, buildLoginPath, normalizeNextPath } from "@/lib/auth-routing";
import { BackendUrlConfigurationError, buildBackendUrl } from "@/lib/backend-url";
import type { ErrorStateVariant } from "@/lib/error-states";

function appendSetCookieHeaders(source: Response, target: NextResponse): void {
  for (const cookieValue of source.headers.getSetCookie()) {
    target.headers.append("set-cookie", cookieValue);
  }
}

function buildUnavailableResponse(request: NextRequest, nextPath: string, variant: ErrorStateVariant): NextResponse {
  return NextResponse.redirect(new URL(buildAuthUnavailablePath(nextPath, variant), request.url));
}

export async function GET(request: NextRequest) {
  const nextPath = normalizeNextPath(request.nextUrl.searchParams.get("next"));
  const cookieHeader = request.headers.get("cookie");

  let response: Response;

  try {
    response = await fetch(buildBackendUrl("/api/auth/refresh"), {
      method: "POST",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof BackendUrlConfigurationError) {
      return buildUnavailableResponse(request, nextPath, "auth-misconfigured");
    }
    return buildUnavailableResponse(request, nextPath, "backend-unavailable");
  }

  if (response.ok) {
    const redirectResponse = NextResponse.redirect(new URL(nextPath, request.url));
    appendSetCookieHeaders(response, redirectResponse);
    return redirectResponse;
  }

  if (response.status === 401) {
    const redirectResponse = NextResponse.redirect(new URL(buildLoginPath(nextPath), request.url));
    appendSetCookieHeaders(response, redirectResponse);
    return redirectResponse;
  }

  return buildUnavailableResponse(request, nextPath, "backend-unavailable");
}
