import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectPersonaClient } from "@/components/ProjectPersonaClient";
import { RECENT_PROJECT_STORAGE_KEY } from "@/lib/recent-project";
import { PERSONA_FIELDS } from "@/lib/persona";
import { changeValue, click, render } from "@/test/render";
import type { PersonaPageData } from "@/lib/types";

const generatePersonaField = vi.fn();
const flushProjectSettingsKeepalive = vi.fn();
const getProjectPersonaStatus = vi.fn();
const updatePersonaField = vi.fn();
const updateProjectSettings = vi.fn();
const updateProjectPreference = vi.fn();

vi.mock("@/lib/api", () => ({
  flushProjectSettingsKeepalive: (...args: unknown[]) => flushProjectSettingsKeepalive(...args),
  generatePersonaField: (...args: unknown[]) => generatePersonaField(...args),
  getProjectPersonaStatus: (...args: unknown[]) => getProjectPersonaStatus(...args),
  updatePersonaField: (...args: unknown[]) => updatePersonaField(...args),
  updateProjectSettings: (...args: unknown[]) => updateProjectSettings(...args),
  updateProjectPreference: (...args: unknown[]) => updateProjectPreference(...args),
}));

function buildPersonaPageData(): PersonaPageData {
  return {
    project: {
      id: 9,
      name: "Persona Project",
      description: "Sharpen the persona.",
      learning_goal: "hybrid",
      status: "active",
      created_at: "2026-04-19T10:00:00Z",
      updated_at: "2026-04-19T10:00:00Z",
      transcript_count: 2,
      run_count: 1,
    },
    preferences: { persona_fields_expanded: false },
    fields: PERSONA_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      value: field.key === "target_style" ? "Direct and specific." : field.key === "target_behaviors" ? "Stay grounded." : "",
      generation_status: "idle",
      error_message: null,
      provenance: {},
      last_generated_at: null,
    })),
    jobs: [],
    worker: {
      state: "online",
      online: true,
      stale: false,
      worker_name: "railway-worker",
      runtime_role: "worker",
      last_seen_at: "2026-04-19T10:00:00Z",
      message: "Generation worker is available.",
    },
  };
}

describe("ProjectPersonaClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generatePersonaField.mockReset();
    flushProjectSettingsKeepalive.mockReset();
    getProjectPersonaStatus.mockReset();
    updatePersonaField.mockReset();
    updateProjectSettings.mockReset();
    updateProjectPreference.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("persists the more-fields preference", async () => {
    updateProjectPreference.mockResolvedValue({ persona_fields_expanded: true });

    const view = await render(<ProjectPersonaClient initialData={buildPersonaPageData()} />);

    expect(view.container.textContent).not.toContain("Stable traits");
    const button = Array.from(view.container.querySelectorAll("button")).find((node) => node.textContent === "Show more fields");
    expect(button).toBeTruthy();

    await click(button as HTMLButtonElement);

    expect(updateProjectPreference).toHaveBeenCalledWith(9, { persona_fields_expanded: true });
    expect(view.container.textContent).toContain("Stable traits");

    await view.unmount();
  });

  it("renders project basics and keeps generating state on the button only", async () => {
    generatePersonaField.mockResolvedValue({
      id: 1,
      job_type: "persona_field",
      target_key: "target_style",
      status: "queued",
      warning_message: null,
      error_message: null,
      result: {},
      queued_at: "2026-04-19T10:00:00Z",
      started_at: null,
      completed_at: null,
    });
    getProjectPersonaStatus.mockResolvedValue({
      preferences: { persona_fields_expanded: false },
      fields: buildPersonaPageData().fields,
      jobs: [
        {
          id: 1,
          job_type: "persona_field",
          target_key: "target_style",
          status: "queued",
          warning_message: null,
          error_message: null,
          result: {},
          queued_at: "2026-04-19T10:00:00Z",
          started_at: null,
          completed_at: null,
        },
      ],
      worker: buildPersonaPageData().worker,
    });

    const view = await render(<ProjectPersonaClient initialData={buildPersonaPageData()} />);

    expect(view.container.textContent).toContain("Basics");
    expect(view.container.textContent).toContain("Worker online");
    expect(view.container.textContent).not.toContain("Generation worker is available.");

    const button = Array.from(view.container.querySelectorAll("button")).find((node) => node.textContent === "Generate");
    expect(button).toBeTruthy();

    await click(button as HTMLButtonElement);

    expect(view.container.textContent).toContain("Generating...");
    const firstFieldFootnote = view.container.querySelector(".field-footnote");
    expect(firstFieldFootnote).toBeNull();

    await view.unmount();
  });

  it("shows the last generated timestamp once a field is complete", async () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("4/19/2026, 10:15:00 AM");

    const data = buildPersonaPageData();
    data.fields = data.fields.map((field) =>
      field.key === "target_style"
        ? { ...field, last_generated_at: "2026-04-19T10:15:00Z" }
        : field
    );

    const view = await render(<ProjectPersonaClient initialData={data} />);

    expect(view.container.textContent).toContain("Generated 4/19/2026, 10:15:00 AM");

    await view.unmount();
  });

  it("shows the detailed worker message only when the worker is not online", async () => {
    const staleWorkerPage = buildPersonaPageData();
    staleWorkerPage.worker = {
      state: "stale",
      online: false,
      stale: true,
      worker_name: "railway-worker",
      runtime_role: "worker_error",
      last_seen_at: "2026-04-19T10:00:00Z",
      message: "Generation worker heartbeat is stale. Start or restart the Railway worker before queueing jobs.",
    };

    const view = await render(<ProjectPersonaClient initialData={staleWorkerPage} />);

    expect(view.container.textContent).toContain("Worker stale");
    expect(view.container.textContent).toContain("Shape the working persona card here.");
    expect(view.container.textContent).toContain("Start or restart the Railway worker before queueing jobs.");

    await view.unmount();
  });

  it("updates the remembered project name after project settings save", async () => {
    window.history.pushState({}, "", "/projects/9/persona");
    updateProjectSettings.mockResolvedValue({
      ...buildPersonaPageData().project,
      name: "Renamed persona",
      description: "Sharper focus.",
    });

    const view = await render(<ProjectPersonaClient initialData={buildPersonaPageData()} />);

    const inputs = view.container.querySelectorAll("input, textarea");
    await changeValue(inputs[0] as HTMLInputElement, "Renamed persona");
    await changeValue(inputs[1] as HTMLTextAreaElement, "Sharper focus.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(JSON.parse(window.localStorage.getItem(RECENT_PROJECT_STORAGE_KEY) || "{}")).toEqual(
      expect.objectContaining({
        projectName: "Renamed persona",
        href: "/projects/9/persona",
      })
    );

    await view.unmount();
    window.history.pushState({}, "", "/");
  });

  it("queues multiple field generation jobs and refreshes their results independently", async () => {
    generatePersonaField
      .mockResolvedValueOnce({
        id: 1,
        job_type: "persona_field",
        target_key: "target_style",
        status: "queued",
        warning_message: null,
        error_message: null,
        result: {},
        queued_at: "2026-04-19T10:00:00Z",
        started_at: null,
        completed_at: null,
      })
      .mockResolvedValueOnce({
        id: 2,
        job_type: "persona_field",
        target_key: "target_behaviors",
        status: "queued",
        warning_message: null,
        error_message: null,
        result: {},
        queued_at: "2026-04-19T10:00:01Z",
        started_at: null,
        completed_at: null,
      });
    getProjectPersonaStatus.mockResolvedValue({
      fields: buildPersonaPageData().fields.map((field) =>
        field.key === "target_style"
          ? { ...field, value: "Generated voice.", generation_status: "idle" }
          : field.key === "target_behaviors"
            ? { ...field, value: "Generated behaviors.", generation_status: "idle" }
            : field
      ),
      jobs: [],
      preferences: { persona_fields_expanded: false },
      worker: {
        state: "online",
        online: true,
        stale: false,
        worker_name: "railway-worker",
        runtime_role: "worker",
        last_seen_at: "2026-04-19T10:00:00Z",
        message: "Generation worker is available.",
      },
    });

    const view = await render(<ProjectPersonaClient initialData={buildPersonaPageData()} />);
    const generateButtons = Array.from(view.container.querySelectorAll("button")).filter((node) => node.textContent === "Generate");

    await click(generateButtons[0] as HTMLButtonElement);
    await click(generateButtons[1] as HTMLButtonElement);

    expect(generatePersonaField).toHaveBeenNthCalledWith(1, 9, { field_key: "target_style" });
    expect(generatePersonaField).toHaveBeenNthCalledWith(2, 9, { field_key: "target_behaviors" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const panels = Array.from(view.container.querySelectorAll("section.panel"));
    const personaTextareas = Array.from((panels[1] as HTMLElement).querySelectorAll("textarea"));
    expect((personaTextareas[0] as HTMLTextAreaElement).value).toBe("Generated voice.");
    expect((personaTextareas[1] as HTMLTextAreaElement).value).toBe("Generated behaviors.");

    await view.unmount();
  });

  it("rechecks worker status while the page is idle and the worker is missing", async () => {
    const missingWorker = buildPersonaPageData();
    missingWorker.worker = {
      state: "missing",
      online: false,
      stale: false,
      worker_name: null,
      runtime_role: null,
      last_seen_at: null,
      message: "Generation worker has not checked in yet. Start or restart the Railway worker before queueing jobs.",
    };
    getProjectPersonaStatus.mockResolvedValue({
      preferences: { persona_fields_expanded: false },
      fields: missingWorker.fields,
      jobs: [],
      worker: buildPersonaPageData().worker,
    });

    const view = await render(<ProjectPersonaClient initialData={missingWorker} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(getProjectPersonaStatus).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain("Worker online");

    await view.unmount();
  });

  it("does not overlap persona status polls while a refresh is still in flight", async () => {
    let resolveStatus: ((value: unknown) => void) | null = null;
    const missingWorker = buildPersonaPageData();
    missingWorker.worker = {
      state: "missing",
      online: false,
      stale: false,
      worker_name: null,
      runtime_role: null,
      last_seen_at: null,
      message: "Generation worker has not checked in yet. Start or restart the Railway worker before queueing jobs.",
    };
    getProjectPersonaStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        })
    );

    const view = await render(<ProjectPersonaClient initialData={missingWorker} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    expect(getProjectPersonaStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStatus?.({
        preferences: { persona_fields_expanded: false },
        fields: missingWorker.fields,
        jobs: [],
        worker: buildPersonaPageData().worker,
      });
      await Promise.resolve();
    });

    await view.unmount();
  });

  it("backs off persona polling when jobs stay queued and the worker is still unavailable", async () => {
    const missingWorker = buildPersonaPageData();
    missingWorker.worker = {
      state: "missing",
      online: false,
      stale: false,
      worker_name: null,
      runtime_role: null,
      last_seen_at: null,
      message: "Generation worker has not checked in yet. Start or restart the Railway worker before queueing jobs.",
    };
    missingWorker.jobs = [
      {
        id: 1,
        job_type: "persona_field",
        target_key: "target_style",
        status: "queued",
        warning_message: null,
        error_message: null,
        result: {},
        queued_at: "2026-04-19T10:00:00Z",
        started_at: null,
        completed_at: null,
      },
    ];
    getProjectPersonaStatus.mockResolvedValue({
      preferences: { persona_fields_expanded: false },
      fields: missingWorker.fields,
      jobs: missingWorker.jobs,
      worker: missingWorker.worker,
    });

    const view = await render(<ProjectPersonaClient initialData={missingWorker} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    expect(getProjectPersonaStatus).toHaveBeenCalledTimes(2);

    await view.unmount();
  });

  it("clears persona polling errors after a successful retry", async () => {
    const missingWorker = buildPersonaPageData();
    missingWorker.worker = {
      state: "missing",
      online: false,
      stale: false,
      worker_name: null,
      runtime_role: null,
      last_seen_at: null,
      message: "Generation worker has not checked in yet. Start or restart the Railway worker before queueing jobs.",
    };
    getProjectPersonaStatus
      .mockRejectedValueOnce(new Error("Temporary persona refresh failure"))
      .mockResolvedValueOnce({
        preferences: { persona_fields_expanded: false },
        fields: missingWorker.fields,
        jobs: [],
        worker: buildPersonaPageData().worker,
      });

    const view = await render(<ProjectPersonaClient initialData={missingWorker} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(view.container.textContent).toContain("Temporary persona refresh failure");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(view.container.textContent).toContain("Worker online");
    expect(view.container.textContent).not.toContain("Temporary persona refresh failure");

    await view.unmount();
  });
});
