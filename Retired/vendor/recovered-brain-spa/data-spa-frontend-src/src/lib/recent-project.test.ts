import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RECENT_PROJECT_EVENT,
  getProjectSectionLabel,
  loadRecentProject,
  parseProjectPathname,
  RECENT_PROJECT_STORAGE_KEY,
  saveRecentProject,
} from "@/lib/recent-project";

describe("recent-project", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    window.localStorage.clear();
    warnSpy.mockClear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("parses project paths and defaults bare project urls to persona", () => {
    expect(parseProjectPathname("/projects/7")).toEqual({
      projectId: 7,
      href: "/projects/7/persona",
      sectionKey: "persona",
    });
    expect(parseProjectPathname("/projects/7/transcripts")).toEqual({
      projectId: 7,
      href: "/projects/7/transcripts",
      sectionKey: "transcripts",
    });
    expect(parseProjectPathname("/settings")).toBeNull();
  });

  it("stores and restores the last opened project location", () => {
    const saved = saveRecentProject({ id: 11, name: "Atlas" }, "/projects/11/runs");

    expect(saved).toEqual({
      projectId: 11,
      projectName: "Atlas",
      href: "/projects/11/runs",
      sectionLabel: "Runs",
    });
    expect(loadRecentProject()).toEqual(saved);
  });

  it("drops corrupted storage payloads", () => {
    window.localStorage.setItem(RECENT_PROJECT_STORAGE_KEY, "{not-json");

    expect(loadRecentProject()).toBeNull();
    expect(window.localStorage.getItem(RECENT_PROJECT_STORAGE_KEY)).toBeNull();
  });

  it("returns human labels for project sections", () => {
    expect(getProjectSectionLabel("/projects/5/persona")).toBe("Persona");
    expect(getProjectSectionLabel("/projects/5/transcripts")).toBe("Transcripts");
    expect(getProjectSectionLabel("/projects/5/assistant")).toBe("Workspace");
  });

  it("returns null when storage reads throw", () => {
    const getItem = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });

    expect(loadRecentProject()).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("[recent-project] load failed", expect.any(Error));

    getItem.mockRestore();
  });

  it("still dispatches a recent-project event when storage writes fail", () => {
    const setItem = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    const listener = vi.fn();
    window.addEventListener(RECENT_PROJECT_EVENT, listener as EventListener);

    const saved = saveRecentProject({ id: 12, name: "North Star" }, "/projects/12/persona");

    expect(saved).toEqual({
      projectId: 12,
      projectName: "North Star",
      href: "/projects/12/persona",
      sectionLabel: "Persona",
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("[recent-project] save failed", expect.any(Error));

    window.removeEventListener(RECENT_PROJECT_EVENT, listener as EventListener);
    setItem.mockRestore();
  });
});
