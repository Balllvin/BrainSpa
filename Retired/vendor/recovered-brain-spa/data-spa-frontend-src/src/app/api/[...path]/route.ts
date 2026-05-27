import { NextRequest, NextResponse } from "next/server";

import { BackendUrlConfigurationError, buildBackendUrl } from "@/lib/backend-url";

export const runtime = "nodejs";

function buildProxyErrorResponse(detail: string): NextResponse {
  return NextResponse.json({ detail }, { status: 503 });
}

function hasRequestBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function copyRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

function appendSetCookieHeaders(source: Headers, target: Headers): void {
  const getSetCookie = source.getSetCookie?.bind(source);
  const cookieValues = getSetCookie ? getSetCookie() : [];
  if (cookieValues.length > 0) {
    target.delete("set-cookie");
    for (const cookieValue of cookieValues) {
      target.append("set-cookie", cookieValue);
    }
    return;
  }

  const cookieValue = source.get("set-cookie");
  if (cookieValue) {
    target.set("set-cookie", cookieValue);
  }
}

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;

  let targetUrl: string;
  try {
    const apiPath = `/api/${path.join("/")}${request.nextUrl.search}`;
    targetUrl = buildBackendUrl(apiPath);
  } catch (error) {
    if (error instanceof BackendUrlConfigurationError) {
      return buildProxyErrorResponse(error.message);
    }
    throw error;
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: copyRequestHeaders(request),
      body: hasRequestBody(request.method) ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    appendSetCookieHeaders(upstreamResponse.headers, responseHeaders);

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return buildProxyErrorResponse("The frontend could not reach the backend service.");
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const HEAD = proxyRequest;
export const OPTIONS = proxyRequest;
