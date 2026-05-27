"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProjectSettingsClient } from "@/components/ProjectSettingsClient";
import {
  flushPersonaFieldKeepalive,
  generatePersonaField,
  getProjectPersonaStatus,
  updatePersonaField,
  updateProjectPreference,
} from "@/lib/api";
import { PERSONA_FIELDS } from "@/lib/persona";
import { useRecentProjectSync } from "@/lib/use-recent-project-sync";
import type { GenerationJob, PersonaFieldState, PersonaPageData, ProjectSettingsResponse, SetupSection, WorkerStatus } from "@/lib/types";
import { getWorkerBadgeLabel, isWorkerOnline } from "@/lib/worker-status";

type SaveState = "saved" | "unsaved" | "saving" | "failed";

const PRIMARY_FIELD_KEYS = new Set<SetupSection>(["target_style", "target_behaviors"]);

function getSaveStateLabel(saveState: SaveState): string {
  switch (saveState) {
    case "unsaved":
      return "Unsaved";
    case "saving":
      return "Saving...";
    case "failed":
      return "Save failed";
    default:
      return "Saved";
  }
}

function toFieldMap(fields: PersonaFieldState[]): Record<string, PersonaFieldState> {
  const next: Record<string, PersonaFieldState> = {};
  for (const field of fields) {
    next[field.key] = field;
  }
  return next;
}

function getGeneratedLabel(lastGeneratedAt: string | null): string | null {
  if (!lastGeneratedAt) {
    return null;
  }
  const parsed = new Date(lastGeneratedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return `Generated ${parsed.toLocaleString()}`;
}

function getPersonaSubtitle(): string {
  return "Shape the working persona card here.";
}

function isActiveJob(job: GenerationJob): boolean {
  return job.status === "queued" || job.status === "processing";
}

function getRecoveryDelay(attempt: number): number {
  return Math.min(3000 * 2 ** attempt, 30000);
}

export function ProjectPersonaClient({ initialData }: { initialData: PersonaPageData }) {
  const requestIdRef = useRef(0);
  const lastSavedRef = useRef(toFieldMap(initialData.fields));
  const fieldsRef = useRef<Record<string, PersonaFieldState>>(toFieldMap(initialData.fields));
  const jobsRef = useRef(initialData.jobs);
  const workerRef = useRef(initialData.worker);
  const refreshPersonaStateRef = useRef<() => Promise<void>>(async () => {});
  const timeoutRef = useRef<number | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const recoveryAttemptRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const persistDirtyFieldsRef = useRef<(fieldKeys: SetupSection[]) => Promise<void>>(async () => {});
  const [fields, setFields] = useState<Record<string, PersonaFieldState>>(toFieldMap(initialData.fields));
  const [jobs, setJobs] = useState(initialData.jobs);
  const [worker, setWorker] = useState(initialData.worker);
  const [project, setProject] = useState(initialData.project);
  const [expanded, setExpanded] = useState(initialData.preferences.persona_fields_expanded);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);

  useRecentProjectSync({ id: project.id, name: project.name });

  useEffect(() => {
    setProject(initialData.project);
    setFields(toFieldMap(initialData.fields));
    setJobs(initialData.jobs);
    setWorker(initialData.worker);
    setExpanded(initialData.preferences.persona_fields_expanded);
    setSaveState("saved");
    setError(null);
    lastSavedRef.current = toFieldMap(initialData.fields);
    fieldsRef.current = toFieldMap(initialData.fields);
    jobsRef.current = initialData.jobs;
    workerRef.current = initialData.worker;
    recoveryAttemptRef.current = 0;
  }, [initialData]);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    workerRef.current = worker;
  }, [worker]);

  function dirtyFieldKeysFor(fieldMap: Record<string, PersonaFieldState>): SetupSection[] {
    return PERSONA_FIELDS.map((field) => field.key)
      .filter((fieldKey): fieldKey is SetupSection => {
        const currentField = fieldMap[fieldKey];
        const savedField = lastSavedRef.current[fieldKey];
        return Boolean(currentField) && currentField.value !== (savedField?.value || "");
      });
  }

  const orderedFields = useMemo(
    () =>
      PERSONA_FIELDS.map((field) => fields[field.key]).filter((field): field is PersonaFieldState => Boolean(field)),
    [fields]
  );
  const visibleFields = useMemo(
    () => orderedFields.filter((field) => expanded || PRIMARY_FIELD_KEYS.has(field.key)),
    [expanded, orderedFields]
  );
  const dirtyKeys = useMemo(
    () => dirtyFieldKeysFor(fields),
    [fields]
  );
  const hasActiveJobs = jobs.some(isActiveJob);
  const latestJobByKey = useMemo(() => {
    const next = new Map<SetupSection, GenerationJob>();
    for (const job of jobs) {
      const key = job.target_key as SetupSection;
      if (!next.has(key)) {
        next.set(key, job);
      }
    }
    return next;
  }, [jobs]);
  const activeJobKeys = useMemo(
    () => new Set(jobs.filter(isActiveJob).map((job) => job.target_key)),
    [jobs]
  );

  persistDirtyFieldsRef.current = async (fieldKeys: SetupSection[]): Promise<void> => {
    if (fieldKeys.length === 0) {
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSaveState("saving");
    setError(null);
    try {
      const savedFields = await Promise.all(
        fieldKeys.map((fieldKey) =>
          updatePersonaField(initialData.project.id, fieldKey, { value: fieldsRef.current[fieldKey].value })
        )
      );
      if (requestIdRef.current !== requestId) {
        return;
      }
      lastSavedRef.current = {
        ...lastSavedRef.current,
        ...toFieldMap(savedFields),
      };
      setFields((current) => ({ ...current, ...toFieldMap(savedFields) }));
      setSaveState("saved");
    } catch (reason) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setSaveState("failed");
      setError(reason instanceof Error ? reason.message : "Could not save persona fields.");
    }
  };

  async function flushPendingSave(): Promise<void> {
    const pendingKeys = dirtyFieldKeysFor(fieldsRef.current);
    if (pendingKeys.length === 0) {
      return;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    await persistDirtyFieldsRef.current(pendingKeys);
  }

  useEffect(() => {
    if (dirtyKeys.length === 0) {
      return;
    }
    setSaveState("unsaved");
    timeoutRef.current = window.setTimeout(() => {
      void persistDirtyFieldsRef.current(dirtyFieldKeysFor(fieldsRef.current));
    }, 700);
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [dirtyKeys, initialData.project.id]);

  refreshPersonaStateRef.current = async (): Promise<void> => {
    if (refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    try {
      const latest = await getProjectPersonaStatus(initialData.project.id);
      const activeDirtyKeys = new Set(
        Object.values(fieldsRef.current)
          .filter((field) => field.value !== (lastSavedRef.current[field.key]?.value || ""))
          .map((field) => field.key)
      );
      setError(null);
      setJobs(latest.jobs);
      setWorker(latest.worker);
      setExpanded(latest.preferences.persona_fields_expanded);
      setFields((current) => {
        const next = { ...current };
        for (const field of latest.fields) {
          if (activeDirtyKeys.has(field.key)) {
            next[field.key] = {
              ...next[field.key],
              generation_status: field.generation_status,
              error_message: field.error_message,
              provenance: field.provenance,
              last_generated_at: field.last_generated_at,
            };
          } else {
            next[field.key] = field;
          }
        }
        return next;
      });
      for (const field of latest.fields) {
        if (!activeDirtyKeys.has(field.key)) {
          lastSavedRef.current[field.key] = field;
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not refresh persona jobs.");
    } finally {
      refreshInFlightRef.current = false;
    }
  };

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
        await refreshPersonaStateRef.current();
        const latestHasActiveJobs = jobsRef.current.some(isActiveJob);
        const latestWorkerOnline = isWorkerOnline(workerRef.current);
        if (latestHasActiveJobs && latestWorkerOnline) {
          recoveryAttemptRef.current = 0;
          scheduleNext(3000);
          return;
        }
        if (latestWorkerOnline) {
          return;
        }
        recoveryAttemptRef.current += 1;
        scheduleNext(getRecoveryDelay(recoveryAttemptRef.current));
      }, delay);
    }

    clearPollTimeout();
    if (hasActiveJobs && isWorkerOnline(workerRef.current)) {
      recoveryAttemptRef.current = 0;
      scheduleNext(3000);
    } else if (!isWorkerOnline(workerRef.current)) {
      scheduleNext(getRecoveryDelay(recoveryAttemptRef.current));
    }

    return clearPollTimeout;
  }, [hasActiveJobs, initialData.project.id, worker.state]);

  useEffect(() => {
    const handlePageHide = () => {
      for (const fieldKey of dirtyFieldKeysFor(fieldsRef.current)) {
        flushPersonaFieldKeepalive(initialData.project.id, fieldKey, { value: fieldsRef.current[fieldKey].value });
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      handlePageHide();
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [initialData.project.id]);

  async function handleToggleExpanded(): Promise<void> {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    try {
      await updateProjectPreference(initialData.project.id, { persona_fields_expanded: nextExpanded });
    } catch (reason) {
      setExpanded(!nextExpanded);
      setError(reason instanceof Error ? reason.message : "Could not save persona view preference.");
    }
  }

  async function handleGenerate(fieldKey: SetupSection): Promise<void> {
    if (activeJobKeys.has(fieldKey) || fieldsRef.current[fieldKey]?.generation_status === "generating") {
      return;
    }
    setError(null);
    setFields((current) => ({
      ...current,
      [fieldKey]: {
        ...current[fieldKey],
        generation_status: "generating",
        error_message: null,
      },
    }));
    try {
      const job = await generatePersonaField(initialData.project.id, { field_key: fieldKey });
      setJobs((current) => [job, ...current]);
      await refreshPersonaStateRef.current();
    } catch (reason) {
      setFields((current) => ({
        ...current,
        [fieldKey]: {
          ...current[fieldKey],
          generation_status: "failed",
          error_message: reason instanceof Error ? reason.message : "Could not queue field generation.",
        },
      }));
      setError(reason instanceof Error ? reason.message : "Could not queue field generation.");
    }
  }

  return (
    <div className="page-grid">
      <ProjectSettingsClient
        descriptionText="Name and description live here."
        initialProject={project}
        onSaved={(saved: ProjectSettingsResponse) => setProject(saved)}
        title="Basics"
      />
      <section className="panel stack">
        <div className="page-header">
          <div className="section-header">
            <h2>Persona</h2>
            <p>{getPersonaSubtitle()}</p>
            {isWorkerOnline(worker) ? null : <p>{worker.message}</p>}
          </div>
          <div className="inline-badges">
            <span className={`status-pill ${isWorkerOnline(worker) ? "status-pill-saved" : "status-pill-failed"}`}>
              {getWorkerBadgeLabel(worker)}
            </span>
            <span className={`status-pill status-pill-${saveState}`}>{getSaveStateLabel(saveState)}</span>
          </div>
        </div>
        <div className="toggle-row">
          <button aria-expanded={expanded} className="ghost" onClick={() => void handleToggleExpanded()} type="button">
            {expanded ? "Show fewer fields" : "Show more fields"}
          </button>
        </div>
        <div className="form-grid">
          {visibleFields.map((field) => {
            const definition = PERSONA_FIELDS.find((item) => item.key === field.key);
            const spanTwo = PRIMARY_FIELD_KEYS.has(field.key);
            const generating = field.generation_status === "generating" || activeJobKeys.has(field.key);
            const latestJob = latestJobByKey.get(field.key);
            const warningMessage = generating ? null : latestJob?.warning_message || null;
            const showFailureLabel = field.generation_status === "failed" && !field.error_message;
            const generatedLabel = generating ? null : getGeneratedLabel(field.last_generated_at);
            return (
              <label className={`field ${spanTwo ? "field-span-2" : ""}`} key={field.key}>
                <span className="field-header">
                  <span>{field.label}</span>
                  <button
                    className="secondary small-button"
                    disabled={generating}
                    onClick={() => void handleGenerate(field.key)}
                    type="button"
                  >
                    {generating ? "Generating..." : "Generate"}
                  </button>
                </span>
                <textarea
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      [field.key]: { ...current[field.key], value: event.target.value, error_message: null },
                    }))
                  }
                  onBlur={() => void flushPendingSave()}
                  rows={(definition?.rows || 2) + (spanTwo ? 1 : 0)}
                  value={field.value}
                />
                {showFailureLabel || field.error_message || warningMessage || generatedLabel ? (
                  <div className="field-footnote">
                    {showFailureLabel ? <span className="error">Generation failed</span> : null}
                    {field.error_message ? <span className="error">{field.error_message}</span> : null}
                    {warningMessage ? <span className="muted">{warningMessage}</span> : null}
                    {generatedLabel ? <span className="muted">{generatedLabel}</span> : null}
                  </div>
                ) : null}
              </label>
            );
          })}
        </div>
        {error ? <p className="error">{error}</p> : null}
      </section>
    </div>
  );
}
