import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTranscriptsClient } from "@/components/ProjectTranscriptsClient";
import { changeValue, click, render } from "@/test/render";
import type { TranscriptsPageData } from "@/lib/types";

const generateSyntheticTranscript = vi.fn();
const getProjectTranscripts = vi.fn();
const pasteTranscript = vi.fn();
const updateTranscript = vi.fn();
const uploadTranscript = vi.fn();

vi.mock("@/lib/api", () => ({
  generateSyntheticTranscript: (...args: unknown[]) => generateSyntheticTranscript(...args),
  getProjectTranscripts: (...args: unknown[]) => getProjectTranscripts(...args),
  pasteTranscript: (...args: unknown[]) => pasteTranscript(...args),
  updateTranscript: (...args: unknown[]) => updateTranscript(...args),
  uploadTranscript: (...args: unknown[]) => uploadTranscript(...args),
}));

function buildTranscriptsPageData(): TranscriptsPageData {
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
    transcripts: [
      {
        id: 1,
        source_name: "Interview",
        source_type: "paste",
        created_at: "2026-04-19T10:00:00Z",
        text: "Original transcript",
        char_count: 20,
        metadata: {},
      },
      {
        id: 2,
        source_name: "Synthetic draft",
        source_type: "synthetic",
        created_at: "2026-04-19T10:01:00Z",
        text: "Synthetic transcript",
        char_count: 22,
        metadata: { origin: "synthetic" },
      },
    ],
    jobs: [],
    pagination: {
      total: 2,
      limit: 25,
      offset: 0,
      has_more: false,
    },
  };
}

function buildActiveTranscriptsPageData(): TranscriptsPageData {
  const data = buildTranscriptsPageData();
  return {
    ...data,
    jobs: [
      {
        id: 4,
        job_type: "transcript_generation",
        target_key: "Synthetic draft",
        status: "processing",
        warning_message: null,
        error_message: null,
        result: {},
        queued_at: "2026-04-19T10:02:00Z",
        started_at: "2026-04-19T10:02:03Z",
        completed_at: null,
      },
    ],
  };
}

function buildExpandedTranscriptsPageData(): TranscriptsPageData {
  const data = buildTranscriptsPageData();
  return {
    ...data,
    transcripts: [data.transcripts[0]],
    pagination: {
      total: 2,
      limit: 1,
      offset: 0,
      has_more: true,
    },
  };
}

describe("ProjectTranscriptsClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generateSyntheticTranscript.mockReset();
    getProjectTranscripts.mockReset();
    pasteTranscript.mockReset();
    updateTranscript.mockReset();
    uploadTranscript.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("renders synthetic transcript badges and supports transcript editing", async () => {
    getProjectTranscripts.mockResolvedValue(buildTranscriptsPageData());
    updateTranscript.mockResolvedValue(buildTranscriptsPageData().transcripts[1]);

    const view = await render(<ProjectTranscriptsClient initialData={buildTranscriptsPageData()} />);

    expect(view.container.textContent).toContain("synthetic");

    const editButtons = Array.from(view.container.querySelectorAll("button")).filter((node) => node.textContent === "Edit");
    await click(editButtons[1] as HTMLButtonElement);

    const editInputs = Array.from(view.container.querySelectorAll('input:not([type="file"]), textarea')).slice(-2);
    await changeValue(editInputs[0] as HTMLInputElement, "Edited synthetic draft");
    await changeValue(editInputs[1] as HTMLTextAreaElement, "Edited synthetic transcript");

    const saveButton = Array.from(view.container.querySelectorAll("button"))
      .filter((node) => node.textContent === "Save transcript")
      .at(-1);
    await click(saveButton as HTMLButtonElement);

    expect(updateTranscript).toHaveBeenCalledWith(2, {
      source_name: "Edited synthetic draft",
      text: "Edited synthetic transcript",
    });

    await view.unmount();
  });

  it("does not overlap active transcript refresh requests", async () => {
    let resolveRefresh: ((value: TranscriptsPageData) => void) | undefined;
    getProjectTranscripts.mockImplementation(
      () =>
        new Promise<TranscriptsPageData>((resolve) => {
          resolveRefresh = resolve;
        })
    );

    const view = await render(<ProjectTranscriptsClient initialData={buildActiveTranscriptsPageData()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(getProjectTranscripts).toHaveBeenCalledTimes(1);

    if (resolveRefresh) {
      resolveRefresh(buildActiveTranscriptsPageData());
    }
    await act(async () => {
      await Promise.resolve();
    });

    await view.unmount();
  });

  it("keeps expanded transcripts loaded after editing refreshes the page", async () => {
    const initialData = buildExpandedTranscriptsPageData();
    updateTranscript.mockResolvedValue({
      ...buildTranscriptsPageData().transcripts[1],
      source_name: "Edited synthetic draft",
      text: "Edited synthetic transcript",
    });
    getProjectTranscripts
      .mockResolvedValueOnce({
        ...initialData,
        transcripts: [buildTranscriptsPageData().transcripts[1]],
        pagination: {
          total: 2,
          limit: 1,
          offset: 1,
          has_more: false,
        },
      })
      .mockResolvedValueOnce({
        ...initialData,
        transcripts: [
          initialData.transcripts[0],
          {
            ...buildTranscriptsPageData().transcripts[1],
            source_name: "Edited synthetic draft",
            text: "Edited synthetic transcript",
          },
        ],
        pagination: {
          total: 2,
          limit: 2,
          offset: 0,
          has_more: false,
        },
      });

    const view = await render(<ProjectTranscriptsClient initialData={initialData} />);

    const loadMoreButton = Array.from(view.container.querySelectorAll("button")).find((node) => node.textContent === "Load more transcripts");
    await click(loadMoreButton as HTMLButtonElement);

    const editButtons = Array.from(view.container.querySelectorAll("button")).filter((node) => node.textContent === "Edit");
    await click(editButtons[1] as HTMLButtonElement);

    const editInputs = Array.from(view.container.querySelectorAll('input:not([type="file"]), textarea')).slice(-2);
    await changeValue(editInputs[0] as HTMLInputElement, "Edited synthetic draft");
    await changeValue(editInputs[1] as HTMLTextAreaElement, "Edited synthetic transcript");

    const saveButton = Array.from(view.container.querySelectorAll("button"))
      .filter((node) => node.textContent === "Save transcript")
      .at(-1);
    await click(saveButton as HTMLButtonElement);

    expect(getProjectTranscripts).toHaveBeenNthCalledWith(1, 9, {
      limit: 1,
      offset: 1,
    });
    expect(getProjectTranscripts).toHaveBeenNthCalledWith(2, 9, {
      limit: 2,
      offset: 0,
    });
    expect(view.container.textContent).toContain("Edited synthetic draft");

    await view.unmount();
  });

  it("keeps expanded transcripts visible while active jobs refresh the first page", async () => {
    const initialData = {
      ...buildExpandedTranscriptsPageData(),
      jobs: buildActiveTranscriptsPageData().jobs,
    };
    getProjectTranscripts
      .mockResolvedValueOnce({
        ...initialData,
        transcripts: [buildTranscriptsPageData().transcripts[1]],
        pagination: {
          total: 2,
          limit: 1,
          offset: 1,
          has_more: false,
        },
      })
      .mockResolvedValueOnce({
        ...initialData,
        transcripts: [initialData.transcripts[0]],
        pagination: {
          total: 2,
          limit: 1,
          offset: 0,
          has_more: true,
        },
      });

    const view = await render(<ProjectTranscriptsClient initialData={initialData} />);

    const loadMoreButton = Array.from(view.container.querySelectorAll("button")).find((node) => node.textContent === "Load more transcripts");
    await click(loadMoreButton as HTMLButtonElement);

    expect(view.container.textContent).toContain("Interview");
    expect(view.container.textContent).toContain("Synthetic draft");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(getProjectTranscripts).toHaveBeenNthCalledWith(1, 9, {
      limit: 1,
      offset: 1,
    });
    expect(getProjectTranscripts).toHaveBeenNthCalledWith(2, 9, {
      limit: 1,
      offset: 0,
    });
    expect(view.container.textContent).toContain("Interview");
    expect(view.container.textContent).toContain("Synthetic draft");

    await view.unmount();
  });
});
