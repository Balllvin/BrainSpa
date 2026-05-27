"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createRun, getProjectRuns, getWorkerStatus } from "@/lib/api";
import { appendUniqueItems, mergeVisibleItems } from "@/lib/paginated-list";
import type { PageInfo, RunsPageData } from "@/lib/types";
import { useRecentProjectSync } from "@/lib/use-recent-project-sync";
import { getWorkerBadgeLabel, isWorkerOnline } from "@/lib/worker-status";

function getRecoveryDelay(attempt: number): number {
  return Math.min(3000 * 2 ** attempt, 30000);
}

function getRunsSubtitle(workerMessage: string, workerOnline: boolean): string {
  if (workerOnline) {
    return "Queue and review dataset runs here.";
  }
  return workerMessage;
}

export function ProjectRunsClient({ initialData }: { initialData: RunsPageData }) {
  const router = useRouter();
  const pollTimeoutRef = useRef<number | null>(null);
  const runsRefreshTimeoutRef = useRef<number | null>(null);
  const recoveryAttemptRef = useRef(0);
  const workerRefreshInFlightRef = useRef(false);
  const runsRefreshInFlightRef = useRef(false);
  const workerRef = useRef(initialData.worker);
  const [runs, setRuns] = useState(initialData.runs);
  const [transcripts, setTranscripts] = useState(initialData.transcripts);
  const [worker, setWorker] = useState(initialData.worker);
  const [runsPagination, setRunsPagination] = useState<PageInfo>(initialData.runs_pagination);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [queueing, setQueueing] = useState(false);
  const [loadingMoreRuns, setLoadingMoreRuns] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useRecentProjectSync({ id: initialData.project.id, name: initialData.project.name });

  useEffect(() => {
    setRuns(initialData.runs);
    setTranscripts(initialData.transcripts);
    setWorker(initialData.worker);
    setRunsPagination(initialData.runs_pagination);
    setSelectedIds([]);
    setError(null);
    recoveryAttemptRef.current = 0;
    workerRef.current = initialData.worker;
  }, [initialData]);

  useEffect(() => {
    workerRef.current = worker;
  }, [worker]);

  const hasActiveRuns = useMemo(
    () => runs.some((run) => run.status === "queued" || run.status === "processing"),
    [runs]
  );

  useEffect(() => {
    function clearRunsRefreshTimeout(): void {
      if (runsRefreshTimeoutRef.current !== null) {
        window.clearTimeout(runsRefreshTimeoutRef.current);
        runsRefreshTimeoutRef.current = null;
      }
    }

    async function refreshRuns(): Promise<void> {
      if (runsRefreshInFlightRef.current) {
        return;
      }
      runsRefreshInFlightRef.current = true;
      try {
        const latest = await getProjectRuns(initialData.project.id, {
          limit: runsPagination.limit,
          offset: 0,
        });
        setError(null);
        setRuns((current) => mergeVisibleItems(current, latest.runs, latest.runs_pagination.total));
        setTranscripts(latest.transcripts);
        setWorker(latest.worker);
        setRunsPagination(latest.runs_pagination);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not refresh runs.");
      } finally {
        runsRefreshInFlightRef.current = false;
      }
    }

    function scheduleNextRunsRefresh(): void {
      clearRunsRefreshTimeout();
      runsRefreshTimeoutRef.current = window.setTimeout(async () => {
        await refreshRuns();
        if (hasActiveRuns) {
          scheduleNextRunsRefresh();
        }
      }, 3000);
    }

    clearRunsRefreshTimeout();
    if (!hasActiveRuns) {
      return clearRunsRefreshTimeout;
    }
    scheduleNextRunsRefresh();
    return clearRunsRefreshTimeout;
  }, [hasActiveRuns, initialData.project.id, runsPagination.limit]);

  useEffect(() => {
    function clearPollTimeout(): void {
      if (pollTimeoutRef.current !== null) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    }

    function scheduleNext(delay: number): void {
      clearPollTimeout();
      pollTimeoutRef.current = window.setTimeout(async () => {
        if (workerRefreshInFlightRef.current) {
          scheduleNext(getRecoveryDelay(recoveryAttemptRef.current));
          return;
        }
        workerRefreshInFlightRef.current = true;
        try {
          const latestWorker = await getWorkerStatus();
          setError(null);
          setWorker(latestWorker);
          if (isWorkerOnline(latestWorker)) {
            recoveryAttemptRef.current = 0;
            return;
          }
          recoveryAttemptRef.current += 1;
          scheduleNext(getRecoveryDelay(recoveryAttemptRef.current));
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Could not refresh worker status.");
          recoveryAttemptRef.current += 1;
          scheduleNext(getRecoveryDelay(recoveryAttemptRef.current));
        } finally {
          workerRefreshInFlightRef.current = false;
        }
      }, delay);
    }

    clearPollTimeout();
    if (!hasActiveRuns && !isWorkerOnline(workerRef.current)) {
      scheduleNext(getRecoveryDelay(recoveryAttemptRef.current));
    }
    return clearPollTimeout;
  }, [hasActiveRuns, worker.state]);

  async function handleGenerate(): Promise<void> {
    setQueueing(true);
    setError(null);
    try {
      const run = await createRun(initialData.project.id, selectedIds);
      router.push(`/runs/${run.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not queue dataset generation.");
    } finally {
      setQueueing(false);
    }
  }

  function toggleTranscript(transcriptId: number): void {
    setSelectedIds((current) =>
      current.includes(transcriptId) ? current.filter((value) => value !== transcriptId) : [...current, transcriptId]
    );
  }

  async function handleLoadMoreRuns(): Promise<void> {
    setLoadingMoreRuns(true);
    setError(null);
    try {
      const latest = await getProjectRuns(initialData.project.id, {
        limit: runsPagination.limit,
        offset: runs.length,
      });
      setRuns((current) => appendUniqueItems(current, latest.runs));
      setRunsPagination(latest.runs_pagination);
      setWorker(latest.worker);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load more runs.");
    } finally {
      setLoadingMoreRuns(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="panel stack">
        <div className="page-header">
          <div className="section-header">
            <h2>Dataset runs</h2>
            <p>{getRunsSubtitle(worker.message, isWorkerOnline(worker))}</p>
          </div>
          <span className={`status-pill ${isWorkerOnline(worker) ? "status-pill-saved" : "status-pill-failed"}`}>
            {getWorkerBadgeLabel(worker)}
          </span>
        </div>
        <div className="section-divider stack">
          <div className="section-header">
            <h3>Select evidence</h3>
            <p>Select transcript evidence for the next run, or leave all unchecked to use the full corpus.</p>
          </div>
          <div className="row-group">
            {transcripts.length ? (
              transcripts.map((transcript) => (
                <div className="list-row" key={transcript.id}>
                  <div>
                    <label className="checkbox-row">
                      <input
                        checked={selectedIds.includes(transcript.id)}
                        onChange={() => toggleTranscript(transcript.id)}
                        type="checkbox"
                      />
                      <strong>{transcript.source_name}</strong>
                    </label>
                    <p>{transcript.source_type}</p>
                  </div>
                  <span>{transcript.char_count.toLocaleString()} chars</span>
                </div>
              ))
            ) : (
              <p className="empty-state-text">No transcripts available yet.</p>
            )}
          </div>
          <div className="inline-actions">
            <button className="primary" disabled={!isWorkerOnline(worker) || queueing || transcripts.length === 0} onClick={() => void handleGenerate()} type="button">
              {queueing ? "Queueing..." : "Queue run"}
            </button>
          </div>
        </div>
      </section>

      <section className="panel stack">
        <div className="section-header">
          <h2>Recent runs</h2>
          <p>Queued and processing runs poll automatically.</p>
        </div>
        <div className="row-group">
          {runs.length ? (
            runs.map((run) => (
              <Link className="list-row link-row" href={`/runs/${run.id}`} key={run.id}>
                <div>
                  <strong>Run #{run.id}</strong>
                  <p>{run.status}</p>
                </div>
                <span>{typeof run.summary.example_count === "number" ? `${run.summary.example_count} examples` : "Pending"}</span>
              </Link>
            ))
          ) : (
            <p className="empty-state-text">No runs yet.</p>
          )}
        </div>
        {runsPagination.has_more ? (
          <div className="inline-actions">
            <button className="secondary" disabled={loadingMoreRuns} onClick={() => void handleLoadMoreRuns()} type="button">
              {loadingMoreRuns ? "Loading..." : "Load more runs"}
            </button>
          </div>
        ) : null}
      </section>

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
