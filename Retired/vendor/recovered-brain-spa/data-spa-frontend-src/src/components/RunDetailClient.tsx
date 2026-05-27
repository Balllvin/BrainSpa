"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";

import { getRun, getRunStatus, publishRunBundle } from "@/lib/api";
import type { PublishedBundle, RunDetail, RunSummary } from "@/lib/types";

function formatRunStatus(status: string): string {
  if (!status) {
    return "Unknown";
  }
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function RunDetailClient({ initialRun }: { initialRun: RunDetail }) {
  const [run, setRun] = useState<RunDetail>(initialRun);
  const [pollError, setPollError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedBundle, setPublishedBundle] = useState<PublishedBundle | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!["queued", "processing"].includes(initialRun.status)) {
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const latestStatus: RunSummary = await getRunStatus(run.id);
        if (!["queued", "processing"].includes(latestStatus.status)) {
          const latestDetail = await getRun(run.id);
          setRun(latestDetail);
          setPollError(null);
          window.clearInterval(interval);
          return;
        }
        setRun((current) => ({ ...current, ...latestStatus }));
        setPollError(null);
      } catch (error) {
        setPollError(error instanceof Error ? error.message : "Run status refresh failed");
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [initialRun.status, run.id]);

  const exampleTypeCounts = useMemo(() => {
    const summaryCounts = run.summary.example_type_counts;
    return summaryCounts && typeof summaryCounts === "object" ? (summaryCounts as Record<string, number>) : {};
  }, [run.summary.example_type_counts]);
  const canPublishBundle = run.status === "completed" && run.artifacts.length > 0;
  const primaryTimestampLabel = run.completed_at ? "Completed" : "Queued";
  const primaryTimestampValue = run.completed_at ?? run.queued_at;

  async function handlePublishBundle(): Promise<void> {
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await publishRunBundle(run.id);
      setPublishedBundle(result);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Bundle publish failed");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="panel stack compact-page-panel">
        <div className="page-header">
          <div className="page-title-block">
            <div className="title-row">
              <h1>Run #{run.id}</h1>
              <span className="status-pill">{formatRunStatus(run.status)}</span>
            </div>
            {run.error_message ? <p className="error">{run.error_message}</p> : null}
          </div>
        </div>
        {pollError ? <p className="error">{pollError}</p> : null}
        <div className="stat-grid">
          <div>
            <span>{primaryTimestampLabel}</span>
            <strong>{new Date(primaryTimestampValue).toLocaleString()}</strong>
          </div>
          <div>
            <span>Examples</span>
            <strong>{String((run.summary.example_count as number) || 0)}</strong>
          </div>
          <div>
            <span>Evaluation examples</span>
            <strong>{String((run.summary.eval_count as number) || 0)}</strong>
          </div>
        </div>
      </section>

      {run.status === "completed" ? (
        <section className="panel stack">
          <div className="section-header">
            <h2>Brain Washer bundle</h2>
          </div>
          <p className="muted">
            Publish this run to <code>demos/</code>. Brain Washer will discover it automatically.
          </p>
          <div className="topbar-actions">
            <button className="primary" disabled={publishing || !canPublishBundle} onClick={() => void handlePublishBundle()} type="button">
              {publishing ? "Publishing..." : "Publish to demos"}
            </button>
          </div>
          {!canPublishBundle ? (
            <p className="error">This run completed without a publishable bundle. Check the artifact list or rerun the export.</p>
          ) : null}
          {publishedBundle ? (
            <div className="row-group">
              <div className="list-row">
                <div>
                  <strong>Bundle folder</strong>
                  <p>
                    <code>{publishedBundle.bundle_dir}</code>
                  </p>
                </div>
                <span>{publishedBundle.artifact_count} files</span>
              </div>
              <div className="list-row">
                <div>
                  <strong>Handoff file</strong>
                  <p>
                    <code>{publishedBundle.handoff_path}</code>
                  </p>
                </div>
                <span>Ready</span>
              </div>
            </div>
          ) : null}
          {publishError ? <p className="error">{publishError}</p> : null}
        </section>
      ) : null}

      <section className="panel stack">
        <div className="section-header">
          <h2>Example breakdown</h2>
        </div>
        {Object.keys(exampleTypeCounts).length ? (
          <ul className="plain-list">
            {Object.entries(exampleTypeCounts).map(([key, value]) => (
              <li key={key}>
                <strong>{key}</strong>: {value}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No example-family breakdown recorded yet.</p>
        )}
      </section>

      <section className="panel stack">
        <div className="section-header">
          <h2>Artifacts</h2>
        </div>
        <div className="row-group">
          {run.artifacts.length ? (
            run.artifacts.map((artifact) => (
              <a className="list-row link-row" href={`/api/artifacts/${artifact.id}/download`} key={artifact.id}>
                <div>
                  <strong>{artifact.filename}</strong>
                  <p>{artifact.artifact_type}</p>
                </div>
                <span>{artifact.size_bytes.toLocaleString()} bytes</span>
              </a>
            ))
          ) : (
            <p className="empty-state-text">Artifacts appear when the run completes.</p>
          )}
        </div>
      </section>

      <section className="panel stack">
        <div className="section-header">
          <h2>Events</h2>
        </div>
        <div className="row-group timeline">
          {run.events.length ? (
            run.events.map((event) => (
              <div className="timeline-row" key={event.id}>
                <div>
                  <strong>{event.stage}</strong>
                  <p>{event.message}</p>
                </div>
                <span>{new Date(event.created_at).toLocaleTimeString()}</span>
              </div>
            ))
          ) : (
            <p className="empty-state-text">No events yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
