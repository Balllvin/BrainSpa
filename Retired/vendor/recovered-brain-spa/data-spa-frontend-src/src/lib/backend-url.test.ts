/* @vitest-environment node */

import { describe, expect, it } from "vitest";

import { BackendUrlConfigurationError, buildBackendUrl, resolveBackendUrl } from "@/lib/backend-url";

function createEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    ...overrides,
  };
}

describe("resolveBackendUrl", () => {
  it("falls back to localhost during development", () => {
    expect(resolveBackendUrl(createEnv())).toBe("http://127.0.0.1:8000");
  });

  it("falls back to localhost during tests", () => {
    expect(resolveBackendUrl(createEnv({ NODE_ENV: "test" }))).toBe("http://127.0.0.1:8000");
  });

  it("prefers BACKEND_URL over NEXT_PUBLIC_API_URL", () => {
    expect(
      resolveBackendUrl(
        createEnv({
          NODE_ENV: "production",
          BACKEND_URL: "https://backend.internal.example/",
          NEXT_PUBLIC_API_URL: "https://public.example",
        })
      )
    ).toBe("https://backend.internal.example");
  });

  it("uses NEXT_PUBLIC_API_URL when BACKEND_URL is absent", () => {
    expect(
      resolveBackendUrl(
        createEnv({
          NODE_ENV: "production",
          NEXT_PUBLIC_API_URL: "https://public.example/",
        })
      )
    ).toBe("https://public.example");
  });

  it("rejects missing backend configuration in production", () => {
    expect(() => resolveBackendUrl(createEnv({ NODE_ENV: "production" }))).toThrow(BackendUrlConfigurationError);
  });

  it("rejects malformed backend URLs", () => {
    expect(
      () =>
        resolveBackendUrl(
          createEnv({
            NODE_ENV: "production",
            BACKEND_URL: "backend.internal.example",
          })
        )
    ).toThrow(
      "BACKEND_URL or NEXT_PUBLIC_API_URL must be a valid absolute http(s) URL."
    );
  });

  it("rejects unsupported backend URL schemes", () => {
    expect(
      () =>
        resolveBackendUrl(
          createEnv({
            NODE_ENV: "production",
            BACKEND_URL: "ftp://backend.internal.example",
          })
        )
    ).toThrow(
      "BACKEND_URL or NEXT_PUBLIC_API_URL must use http:// or https://."
    );
  });
});

describe("buildBackendUrl", () => {
  it("joins backend base URLs and API paths cleanly", () => {
    expect(
      buildBackendUrl(
        "/api/auth/login?next=%2F",
        createEnv({
          NODE_ENV: "production",
          BACKEND_URL: "https://backend.internal.example/",
        })
      )
    ).toBe("https://backend.internal.example/api/auth/login?next=%2F");
  });
});
