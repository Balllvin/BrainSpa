import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectSettingsClient } from "@/components/ProjectSettingsClient";
import { changeValue, render } from "@/test/render";

const updateProjectSettings = vi.fn();

vi.mock("@/lib/api", () => ({
  updateProjectSettings: (...args: unknown[]) => updateProjectSettings(...args),
}));

describe("ProjectSettingsClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateProjectSettings.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("moves through autosave states and saves the latest project settings", async () => {
    updateProjectSettings.mockResolvedValue({
      id: 3,
      name: "Saved project",
      description: "Updated goal",
      learning_goal: "hybrid",
      status: "active",
      created_at: "2026-04-19T10:00:00Z",
      updated_at: "2026-04-19T10:00:00Z",
      transcript_count: 0,
      run_count: 0,
    });

    const view = await render(
      <ProjectSettingsClient
        initialProject={{
          id: 3,
          name: "Draft project",
          description: "Initial goal",
          learning_goal: "hybrid",
          status: "active",
          created_at: "2026-04-19T10:00:00Z",
          updated_at: "2026-04-19T10:00:00Z",
          transcript_count: 0,
          run_count: 0,
        }}
      />
    );

    const inputs = view.container.querySelectorAll("input, textarea");
    const status = view.container.querySelector(".status-pill");
    await changeValue(inputs[0] as HTMLInputElement, "Saved project");
    await changeValue(inputs[1] as HTMLTextAreaElement, "Updated goal");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(status?.textContent).toBe("Unsaved");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(updateProjectSettings).toHaveBeenCalledWith(3, {
      name: "Saved project",
      description: "Updated goal",
    });
    expect(status?.textContent).toBe("Saved");

    await view.unmount();
  });

  it("shows validation feedback instead of silently dropping invalid autosave input", async () => {
    const view = await render(
      <ProjectSettingsClient
        initialProject={{
          id: 3,
          name: "Draft project",
          description: "Initial goal",
          learning_goal: "hybrid",
          status: "active",
          created_at: "2026-04-19T10:00:00Z",
          updated_at: "2026-04-19T10:00:00Z",
          transcript_count: 0,
          run_count: 0,
        }}
      />
    );

    const inputs = view.container.querySelectorAll("input, textarea");
    await changeValue(inputs[0] as HTMLInputElement, "A");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(updateProjectSettings).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain("Project name must be at least 2 characters");

    await view.unmount();
  });

  it("notifies callers when a save succeeds", async () => {
    const onSaved = vi.fn();
    updateProjectSettings.mockResolvedValue({
      id: 3,
      name: "Renamed project",
      description: "Updated goal",
      learning_goal: "hybrid",
      status: "active",
      created_at: "2026-04-19T10:00:00Z",
      updated_at: "2026-04-19T10:00:00Z",
      transcript_count: 0,
      run_count: 0,
    });

    const view = await render(
      <ProjectSettingsClient
        initialProject={{
          id: 3,
          name: "Draft project",
          description: "Initial goal",
          learning_goal: "hybrid",
          status: "active",
          created_at: "2026-04-19T10:00:00Z",
          updated_at: "2026-04-19T10:00:00Z",
          transcript_count: 0,
          run_count: 0,
        }}
        onSaved={onSaved}
      />
    );

    const inputs = view.container.querySelectorAll("input, textarea");
    await changeValue(inputs[0] as HTMLInputElement, "Renamed project");
    await changeValue(inputs[1] as HTMLTextAreaElement, "Updated goal");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Renamed project",
        description: "Updated goal",
      })
    );

    await view.unmount();
  });
});
