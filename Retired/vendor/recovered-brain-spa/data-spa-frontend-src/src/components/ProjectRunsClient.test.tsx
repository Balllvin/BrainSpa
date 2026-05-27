import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectRunsClient } from "@/components/ProjectRunsClient";
import { click, render } from "@/test/render";
import type { RunsPageData } from "@/lib/types";

const push = vi.fn();
const createRun = vi.fn();
const getProjectRuns = vi.fn();
const getWorkerStatus = vi.fn();
const BASE_TIME = Date.UTC(2001, 0, 1, 0, 0, 0);

function iso(offsetMs = 0): string {
  return new Date(BASE_TIME + offsetMs).toISOString();
}

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api", () => ({
  createRun: (...args: unknown[]) => createRun(...args),
  getProjectRuns: (...args: unknown[]) => getProjectRuns(...args),
  getWorkerStatus: (...args: unknown[]) => getWorkerStatus(...args),
}));

function buildRunsPageData(): RunsPageData {
  return {
    project: {
      id: 9,
      name: "Persona Project",
      description: "Sharpen the persona.",
      learning_goal: "hybrid",
      status: "active",
      created_at: iso(),
      updated_at: iso(),
      transcript_count: 1,
      run_count: 1,
    },
    transcripts: [
      {
        id: 1,
        source_name: "Interview",
        source_type: "paste",
        created_at: iso(),
        text: "Original transcript",
        char_count: 20,
        metadata: {},
      },
    ],
    runs: [],
    worker: {
      state: "missing",
      online: false,
      stale: false,
      worker_name: null,
      runtime_role: null,
      last_seen_at: null,
      message: "Generation worker has not checked in yet. Start or restart the Railway worker before queueing jobs.",
    },
    runs_pagination: {
      total: 0,
      limit: 25,
      offset: 0,
      has_more: false,
    },
  };
}

function buildActiveRunsPageData(): RunsPageData {
  const data = buildRunsPageData();
  return {
    ...data,
    worker: {
      state: "online",
      online: true,
      stale: false,
      worker_name: "railway-worker",
      runtime_role: "worker",
      last_seen_at: "2026-04-19T10:00:05Z",
      message: "Generation worker is available.",
    },
    runs: [
      {
        id: 3,
        status: "processing",
        queued_at: "2026-04-19T10:00:00Z",
        started_at: "2026-04-19T10:00:03Z",
        completed_at: null,
        error_message: null,
        warnings: [],
        summary: {},
        transcript_ids: [1],
      },
    ],
  };
}

function buildExpandedActiveRunsPageData(): RunsPageData {
  const data = buildActiveRunsPageData();
  return {
    ...data,
    runs_pagination: {
      total: 2,
      limit: 1,
      offset: 0,
      has_more: true,
    },
  };
}

describe("ProjectRunsClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    createRun.mockReset();
    getProjectRuns.mockReset();
    getWorkerStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("shows missing-worker state and disables dataset generation", async () => {
    const view = await render(<ProjectRunsClient initialData={buildRunsPageData()} />);

    expect(view.container.textContent).toContain("Generation worker has not checked in yet");
    expect(view.container.textContent).toContain("Worker missing");
    const button = Array.from(view.container.querySelectorAll("button")).find((node) => node.textContent === "Queue run");
    expect((button as HTMLButtonElement).disabled).toBe(true);

    await view.unmount();
  });

  it("rechecks worker status when the page opens with a missing worker", async () => {
    getWorkerStatus.mockResolvedValue({
      state: "online",
      online: true,
      stale: false,
      worker_name: "railway-worker",
      runtime_role: "worker",
      last_seen_at: iso(5_000),
      message: "Generation worker is available.",
    });

    const view = await render(<ProjectRunsClient initialData={buildRunsPageData()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const button = Array.from(view.container.querySelectorAll("button")).find((node) => node.textContent === "Queue run");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(view.container.textContent).toContain("Worker online");
    expect(view.container.textContent).toContain("Queue and review dataset runs here.");
    expect(view.container.textContent).not.toContain("Generation worker is available.");

    await view.unmount();
  });

  it("clears worker refresh errors after a successful retry", async () => {
    getWorkerStatus
      .mockRejectedValueOnce(new Error("Temporary worker refresh failure"))
      .mockResolvedValueOnce({
        state: "online",
        online: true,
        stale: false,
        worker_name: "railway-worker",
        runtime_role: "worker",
        last_seen_at: iso(5_000),
        message: "Generation worker is available.",
      });

    const view = await render(<ProjectRunsClient initialData={buildRunsPageData()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(view.container.textContent).toContain("Temporary worker refresh failure");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(view.container.textContent).toContain("Worker online");
    expect(view.container.textContent).not.toContain("Temporary worker refresh failure");

    await view.unmount();
  });

  it("does not overlap active run refresh requests", async () => {
    let resolveRefresh: ((value: RunsPageData) => void) | undefined;
    getProjectRuns.mockImplementation(
      () =>
        new Promise<RunsPageData>((resolve) => {
          resolveRefresh = resolve;
        })
    );

    const view = await render(<ProjectRunsClient initialData={buildActiveRunsPageData()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(getProjectRuns).toHaveBeenCalledTimes(1);

    if (resolveRefresh) {
      resolveRefresh(buildActiveRunsPageData());
    }
    await act(async () => {
      await Promise.resolve();
    });

    await view.unmount();
  });

  it("keeps expanded runs visible while active runs keep polling", async () => {
    const initialData = buildExpandedActiveRunsPageData();
    getProjectRuns
      .mockResolvedValueOnce({
        ...initialData,
        runs: [
          {
            id: 2,
            status: "completed",
            queued_at: "2026-04-19T09:58:00Z",
            started_at: "2026-04-19T09:58:03Z",
            completed_at: "2026-04-19T09:59:00Z",
            error_message: null,
            warnings: [],
            summary: { example_count: 8 },
            transcript_ids: [1],
          },
        ],
        runs_pagination: {
          total: 2,
          limit: 1,
          offset: 1,
          has_more: false,
        },
      })
      .mockResolvedValueOnce({
        ...initialData,
        runs: [
          {
            ...initialData.runs[0],
            summary: { example_count: 12 },
          },
        ],
        runs_pagination: {
          total: 2,
          limit: 1,
          offset: 0,
          has_more: true,
        },
      });

    const view = await render(<ProjectRunsClient initialData={initialData} />);

    const loadMoreButton = Array.from(view.container.querySelectorAll("button")).find((node) => node.textContent === "Load more runs");
    await click(loadMoreButton as HTMLButtonElement);

    expect(view.container.textContent).toContain("Run #3");
    expect(view.container.textContent).toContain("Run #2");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(getProjectRuns).toHaveBeenNthCalledWith(1, 9, {
      limit: 1,
      offset: 1,
    });
    expect(getProjectRuns).toHaveBeenNthCalledWith(2, 9, {
      limit: 1,
      offset: 0,
    });
    expect(view.container.textContent).toContain("Run #3");
    expect(view.container.textContent).toContain("Run #2");
    expect(view.container.textContent).toContain("12 examples");

    await view.unmount();
  });
});
