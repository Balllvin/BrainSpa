import { describe, expect, it } from "vitest";

import type { WorkerStatus } from "@/lib/types";
import { getWorkerBadgeLabel, isWorkerOnline } from "@/lib/worker-status";

function buildWorkerStatus(): WorkerStatus {
  return {
    state: "online",
    online: true,
    stale: false,
    worker_name: "railway-worker",
    runtime_role: "worker",
    last_seen_at: "2026-04-19T10:00:00Z",
    message: "Generation worker is available.",
  };
}

describe("worker-status helpers", () => {
  it("fails closed for unknown worker states", () => {
    const malformedWorker = {
      ...buildWorkerStatus(),
      state: "unexpected",
      online: false,
    } as unknown as WorkerStatus;

    expect(getWorkerBadgeLabel(malformedWorker)).toBe("Worker unavailable");
    expect(isWorkerOnline(malformedWorker)).toBe(false);
  });
});
