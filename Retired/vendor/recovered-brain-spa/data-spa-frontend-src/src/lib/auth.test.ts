import { beforeEach, describe, expect, it, vi } from "vitest";

import { logout, refreshToken } from "@/lib/auth";

describe("refreshToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns true on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(refreshToken()).resolves.toBe("refreshed");
  });

  it("returns unauthenticated on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(refreshToken()).resolves.toBe("unauthenticated");
  });

  it("returns unavailable on transport error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("nope")));
    await expect(refreshToken()).resolves.toBe("unavailable");
  });
});

describe("logout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "/" },
    });
  });

  it("redirects after a successful logout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await logout();
    expect(window.location.href).toBe("/login");
  });

  it("throws when logout fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ detail: "boom" }),
      })
    );

    await expect(logout()).rejects.toThrow("boom");
  });
});
