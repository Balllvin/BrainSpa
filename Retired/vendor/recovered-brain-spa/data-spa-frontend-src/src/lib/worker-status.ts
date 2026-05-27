import type { WorkerStatus } from "@/lib/types";

export function getWorkerBadgeLabel(worker: WorkerStatus): string {
  switch (worker.state) {
    case "online":
      return "Worker online";
    case "stale":
      return "Worker stale";
    case "missing":
      return "Worker missing";
    case "error":
      return "Worker error";
    default:
      return "Worker unavailable";
  }
}

export function isWorkerOnline(worker: WorkerStatus): boolean {
  return worker.state === "online";
}
