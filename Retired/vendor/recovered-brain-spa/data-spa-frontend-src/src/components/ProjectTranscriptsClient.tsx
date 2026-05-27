"use client";

import React from "react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  generateSyntheticTranscript,
  getProjectTranscripts,
  pasteTranscript,
  updateTranscript,
  uploadTranscript,
} from "@/lib/api";
import { appendUniqueItems, mergeVisibleItems } from "@/lib/paginated-list";
import { useRecentProjectSync } from "@/lib/use-recent-project-sync";
import type { GenerationJob, PageInfo, TranscriptSummary, TranscriptsPageData } from "@/lib/types";

type ComposerMode = "manual" | "synthetic";

function isActiveJob(job: GenerationJob): boolean {
  return job.status === "queued" || job.status === "processing";
}

function getSyntheticNote(transcript: TranscriptSummary): string | null {
  if (transcript.source_type !== "synthetic") {
    return null;
  }
  const generationSource = transcript.metadata.generation_source;
  if (generationSource === "fallback") {
    return "Fallback draft";
  }
  if (generationSource === "xai") {
    return "Generated with xAI";
  }
  return null;
}

export function ProjectTranscriptsClient({ initialData }: { initialData: TranscriptsPageData }) {
  const refreshTimeoutRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("manual");
  const [transcripts, setTranscripts] = useState(initialData.transcripts);
  const [jobs, setJobs] = useState(initialData.jobs);
  const [pagination, setPagination] = useState<PageInfo>(initialData.pagination);
  const [editingTranscriptId, setEditingTranscriptId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingText, setEditingText] = useState("");
  const [pasteSaving, setPasteSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingSaving, setEditingSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useRecentProjectSync({ id: initialData.project.id, name: initialData.project.name });

  useEffect(() => {
    setTranscripts(initialData.transcripts);
    setJobs(initialData.jobs);
    setPagination(initialData.pagination);
    setEditingTranscriptId(null);
    setEditingName("");
    setEditingText("");
    setError(null);
  }, [initialData]);

  const hasActiveJobs = useMemo(() => jobs.some(isActiveJob), [jobs]);

  useEffect(() => {
    function clearRefreshTimeout(): void {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    }

    async function refreshTranscripts(): Promise<void> {
      if (refreshInFlightRef.current) {
        return;
      }
      refreshInFlightRef.current = true;
      try {
        const latest = await getProjectTranscripts(initialData.project.id, {
          limit: pagination.limit,
          offset: 0,
        });
        setError(null);
        setTranscripts((current) => mergeVisibleItems(current, latest.transcripts, latest.pagination.total));
        setJobs(latest.jobs);
        setPagination(latest.pagination);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not refresh transcripts.");
      } finally {
        refreshInFlightRef.current = false;
      }
    }

    function scheduleNextRefresh(): void {
      clearRefreshTimeout();
      refreshTimeoutRef.current = window.setTimeout(async () => {
        await refreshTranscripts();
        if (hasActiveJobs) {
          scheduleNextRefresh();
        }
      }, 3000);
    }

    clearRefreshTimeout();
    if (!hasActiveJobs) {
      return clearRefreshTimeout;
    }
    scheduleNextRefresh();
    return clearRefreshTimeout;
  }, [hasActiveJobs, initialData.project.id, pagination.limit]);

  async function refreshPage(): Promise<void> {
    const latest = await getProjectTranscripts(initialData.project.id, {
      limit: Math.max(transcripts.length, pagination.limit),
      offset: 0,
    });
    setTranscripts(latest.transcripts);
    setJobs(latest.jobs);
    setPagination(latest.pagination);
  }

  async function handleLoadMore(): Promise<void> {
    setLoadingMore(true);
    setError(null);
    try {
      const latest = await getProjectTranscripts(initialData.project.id, {
        limit: pagination.limit,
        offset: transcripts.length,
      });
      setTranscripts((current) => appendUniqueItems(current, latest.transcripts));
      setJobs(latest.jobs);
      setPagination(latest.pagination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load more transcripts.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handlePaste(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPasteSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      await pasteTranscript(
        initialData.project.id,
        String(formData.get("source_name") || ""),
        String(formData.get("text") || "")
      );
      (event.currentTarget as HTMLFormElement).reset();
      await refreshPage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save transcript.");
    } finally {
      setPasteSaving(false);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadTranscript(initialData.project.id, file);
      await refreshPage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not upload transcript.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setGenerating(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      const job = await generateSyntheticTranscript(initialData.project.id, {
        source_name: String(formData.get("source_name") || ""),
        prompt: String(formData.get("prompt") || ""),
      });
      setJobs((current) => [job, ...current]);
      (event.currentTarget as HTMLFormElement).reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not queue synthetic transcript.");
    } finally {
      setGenerating(false);
    }
  }

  function startEditing(transcript: TranscriptSummary): void {
    setEditingTranscriptId(transcript.id);
    setEditingName(transcript.source_name);
    setEditingText(transcript.text);
  }

  async function handleSaveEdit(): Promise<void> {
    if (editingTranscriptId === null) {
      return;
    }
    setEditingSaving(true);
    setError(null);
    try {
      await updateTranscript(editingTranscriptId, {
        source_name: editingName,
        text: editingText,
      });
      await refreshPage();
      setEditingTranscriptId(null);
      setEditingName("");
      setEditingText("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update transcript.");
    } finally {
      setEditingSaving(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="panel stack">
        <div className="section-header">
          <h2>Source material</h2>
          <p>Add manual transcripts or queue a synthetic draft.</p>
        </div>

        <div className="toggle-row">
          <div className="inline-actions">
            <button
              className={composerMode === "manual" ? "primary" : "ghost"}
              onClick={() => setComposerMode("manual")}
              type="button"
            >
              Manual
            </button>
            <button
              className={composerMode === "synthetic" ? "primary" : "ghost"}
              onClick={() => setComposerMode("synthetic")}
              type="button"
            >
              Synthetic
            </button>
          </div>
        </div>

        {composerMode === "manual" ? (
          <div className="split-panel">
            <form className="stack" onSubmit={(event) => void handlePaste(event)}>
              <label className="field">
                <span>Source name</span>
                <input name="source_name" required />
              </label>
              <label className="field">
                <span>Transcript text</span>
                <textarea name="text" required rows={8} />
              </label>
              <button className="secondary" disabled={pasteSaving} type="submit">
                {pasteSaving ? "Saving..." : "Save transcript"}
              </button>
            </form>
            <label className="upload-zone">
              <span>{uploading ? "Uploading..." : "Upload Transcript"}</span>
              <input accept=".txt,.md,.pdf,.docx" onChange={(event) => void handleFile(event)} type="file" />
            </label>
          </div>
        ) : (
          <form className="stack" onSubmit={(event) => void handleGenerate(event)}>
            <label className="field">
              <span>Source name</span>
              <input name="source_name" placeholder="Synthetic interview draft" required />
            </label>
            <label className="field">
              <span>Prompt</span>
              <textarea name="prompt" placeholder="Generate an interview-style transcript about..." required rows={4} />
            </label>
            <button className="primary" disabled={generating} type="submit">
              {generating ? "Queueing..." : "Generate transcript"}
            </button>
          </form>
        )}

      </section>

      <section className="panel stack">
        <div className="section-header">
          <h2>Saved transcripts</h2>
          <p>Synthetic drafts stay in the corpus with explicit provenance.</p>
        </div>
        <div className="section-divider stack">
          <div className="row-group">
            {transcripts.length ? (
              transcripts.map((transcript) => {
                const syntheticNote = getSyntheticNote(transcript);
                return (
                  <div className="list-row" key={transcript.id}>
                    <div className="stack tight">
                      <div className="inline-badges">
                        <strong>{transcript.source_name}</strong>
                        <span className={`source-badge source-badge-${transcript.source_type}`}>{transcript.source_type}</span>
                        {syntheticNote ? <span className="source-badge">{syntheticNote}</span> : null}
                      </div>
                      <p>{transcript.char_count.toLocaleString()} chars</p>
                    </div>
                    <button className="secondary small-button" onClick={() => startEditing(transcript)} type="button">
                      Edit
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="empty-state-text">No transcripts yet.</p>
            )}
          </div>
          {pagination.has_more ? (
            <div className="inline-actions">
              <button className="secondary" disabled={loadingMore} onClick={() => void handleLoadMore()} type="button">
                {loadingMore ? "Loading..." : "Load more transcripts"}
              </button>
            </div>
          ) : null}
        </div>

        {editingTranscriptId !== null ? (
          <div className="section-divider stack">
            <div className="section-header">
              <h3>Edit transcript</h3>
            </div>
            <label className="field">
              <span>Source name</span>
              <input onChange={(event) => setEditingName(event.target.value)} value={editingName} />
            </label>
            <label className="field">
              <span>Transcript text</span>
              <textarea onChange={(event) => setEditingText(event.target.value)} rows={8} value={editingText} />
            </label>
            <div className="inline-actions">
              <button className="primary" disabled={editingSaving} onClick={() => void handleSaveEdit()} type="button">
                {editingSaving ? "Saving..." : "Save transcript"}
              </button>
              <button className="ghost" onClick={() => setEditingTranscriptId(null)} type="button">
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {jobs.length ? (
        <section className="panel stack">
          <div className="section-header">
            <h2>Pending jobs</h2>
          </div>
          <div className="row-group">
            {jobs.map((job) => (
              <div className="list-row" key={job.id}>
                <div>
                  <strong>{job.target_key}</strong>
                  <p>{job.status}</p>
                </div>
                <span>{job.warning_message || job.error_message || "Waiting"}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
