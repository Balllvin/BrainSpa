import { useEffect, useRef, useState } from "react";

import { fetchTuneBuildJob } from "@/lib/backend";
import type { TuneBuildJob } from "@/lib/types";

const POLL_MS = 1500;

export function useTuneBuildJob(modelSlug: string, enabled: boolean) {
  const [job, setJob] = useState<TuneBuildJob | null>(null);
  const activeRef = useRef(enabled);

  useEffect(() => {
    activeRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function poll() {
      while (activeRef.current && !cancelled) {
        const response = await fetchTuneBuildJob(modelSlug);
        if (response.job) {
          setJob(response.job);
          if (response.job.state !== "running") {
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [modelSlug, enabled]);

  return job;
}
