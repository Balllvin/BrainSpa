/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/[...path]/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("api runtime proxy", () => {
  it("forwards method, query, body, cookies, and set-cookie headers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BACKEND_URL", "https://backend.internal.example/");

    const responseHeaders = new Headers({ "content-type": "application/json" });
    responseHeaders.append("set-cookie", "trainer_access=abc; Path=/; HttpOnly");
    responseHeaders.append("set-cookie", "trainer_refresh=def; Path=/; HttpOnly");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: responseHeaders,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("https://frontend.example.com/api/auth/login?next=%2F", {
      method: "POST",
      headers: {
        cookie: "trainer_refresh=123",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "user@example.com" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["auth", "login"] }),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://backend.internal.example/api/auth/login?next=%2F");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("cookie")).toBe("trainer_refresh=123");
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(
      JSON.stringify({ email: "user@example.com" })
    );

    expect(response.status).toBe(200);
    const setCookieHeaders = response.headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""];
    expect(setCookieHeaders.join("\n")).toContain("trainer_access=abc");
    expect(setCookieHeaders.join("\n")).toContain("trainer_refresh=def");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns 503 when production backend config is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BACKEND_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("https://frontend.example.com/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["auth", "signup"] }),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: "BACKEND_URL or NEXT_PUBLIC_API_URL must be set for frontend production runtime.",
    });
  });

  it("returns 503 when the backend URL is malformed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BACKEND_URL", "backend.internal.example");

    const request = new NextRequest("https://frontend.example.com/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["auth", "signup"] }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: "BACKEND_URL or NEXT_PUBLIC_API_URL must be a valid absolute http(s) URL.",
    });
  });

  it("returns 503 when the backend cannot be reached", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BACKEND_URL", "https://backend.internal.example");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    const request = new NextRequest("https://frontend.example.com/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["auth", "signup"] }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: "The frontend could not reach the backend service.",
    });
  });
});
