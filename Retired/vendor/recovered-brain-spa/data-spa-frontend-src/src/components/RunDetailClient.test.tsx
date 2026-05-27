import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunDetailClient } from "@/components/RunDetailClient";
import { click, getTextContent, render } from "@/test/render";
import type { RunDetail } from "@/lib/types";

const getRun = vi.fn();
const getRunStatus = vi.fn();
const publishRunBundle = vi.fn();
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

vi.mock("@/lib/api", () => ({
  getRun: (...args: unknown[]) => getRun(...args),
  getRunStatus: (...args: unknown[]) => getRunStatus(...args),
  publishRunBundle: (...args: unknown[]) => publishRunBundle(...args),
}));

function buildRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: 7,
    status: "completed",
    queued_at: iso(),
    started_at: iso(60_000),
    completed_at: iso(120_000),
    error_message: null,
    warnings: [],
    summary: { example_count: 18, eval_count: 3, example_type_counts: { qa: 12, rewrite: 6 } },
    transcript_ids: [],
    artifacts: [],
    events: [
      {
        id: 1,
        stage: "queued",
        message: "Run queued.",
        payload: {},
        created_at: iso(),
      },
    ],
    ...overrides,
  };
}

describe("RunDetailClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getRun.mockReset();
    getRunStatus.mockReset();
    publishRunBundle.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("renders the compact header and the retained section structure", async () => {
    const view = await render(
      <RunDetailClient
        initialRun={buildRunDetail({
          artifacts: [
            {
              id: 2,
              artifact_type: "handoff",
              filename: "sft_handoff.json",
              content_type: "application/json",
              size_bytes: 1200,
              created_at: iso(120_000),
            },
          ],
        })}
      />
    );

    expect(view.container.querySelector("h1")?.textContent).toBe("Run #7");
    expect(view.container.textContent).toContain("Brain Washer bundle");
    expect(view.container.textContent).toContain("Publish to demos");
    expect(view.container.textContent).toContain("Example breakdown");
    expect(view.container.textContent).not.toContain("Back");
    expect(view.container.textContent).toContain("Evaluation examples");

    await view.unmount();
  });

  it("continues polling queued runs until completion", async () => {
    getRunStatus.mockResolvedValue({
      id: 7,
      status: "completed",
      queued_at: iso(),
      started_at: iso(60_000),
      completed_at: iso(120_000),
      error_message: null,
      warnings: [],
      summary: { example_count: 20, eval_count: 4 },
      transcript_ids: [],
    });
    getRun.mockResolvedValue(buildRunDetail({ status: "completed" }));

    const view = await render(<RunDetailClient initialRun={buildRunDetail({ status: "queued" })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(getRunStatus).toHaveBeenCalledWith(7);
    expect(getRun).toHaveBeenCalledWith(7);

    await view.unmount();
  });

  it("publishes the completed bundle into the shared folder", async () => {
    publishRunBundle.mockResolvedValue({
      bundle_root: "/tmp/demos",
      bundle_dir: "/tmp/demos/comedian-voice-run-7",
      handoff_path: "/tmp/demos/comedian-voice-run-7/sft_handoff.json",
      artifact_count: 16,
    });

    const view = await render(
      <RunDetailClient
        initialRun={buildRunDetail({
          artifacts: [
            {
              id: 2,
              artifact_type: "handoff",
              filename: "sft_handoff.json",
              content_type: "application/json",
              size_bytes: 1200,
              created_at: iso(120_000),
            },
          ],
        })}
      />
    );

    const button = Array.from(view.container.querySelectorAll("button")).find(
      (node) => node.textContent === "Publish to demos"
    );
    expect(button).toBeTruthy();

    await click(button as HTMLButtonElement);

    expect(publishRunBundle).toHaveBeenCalledWith(7);
    expect(view.container.textContent).toContain("Bundle folder");
    expect(view.container.textContent).toContain("/tmp/demos/comedian-voice-run-7");
    expect(view.container.textContent).toContain("Handoff file");
    expect(view.container.textContent).toContain("sft_handoff.json");

    await view.unmount();
  });

  it("keeps the handoff panel visible when a completed run is missing artifacts", async () => {
    const view = await render(<RunDetailClient initialRun={buildRunDetail({ artifacts: [] })} />);

    expect(view.container.textContent).toContain("Brain Washer bundle");
    expect(view.container.textContent).toContain("without a publishable bundle");
    const button = Array.from(view.container.querySelectorAll("button")).find(
      (node) => node.textContent === "Publish to demos"
    );
    expect((button as HTMLButtonElement).disabled).toBe(true);

    await view.unmount();
  });
});
