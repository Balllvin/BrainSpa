"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";

import { flushProjectSettingsKeepalive, updateProjectSettings } from "@/lib/api";
import type { ProjectSettingsResponse, ProjectSummary } from "@/lib/types";

type ProjectBasics = {
  id: number;
  name: string;
  description: string;
} | ProjectSettingsResponse | ProjectSummary;

type SaveState = "saved" | "unsaved" | "saving" | "failed";

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

function getValidationError(name: string, description: string): string | null {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  if (trimmedName.length >= 2 && trimmedDescription.length >= 4) {
    return null;
  }
  return "Project name must be at least 2 characters and description must be at least 4 characters.";
}

export function ProjectSettingsClient({
  initialProject,
  onSaved,
  title = "Project settings",
  descriptionText = "Autosaves as you edit.",
}: {
  initialProject: ProjectBasics;
  onSaved?: (project: ProjectSettingsResponse) => void;
  title?: string;
  descriptionText?: string;
}) {
  const requestIdRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const saveDraftRef = useRef<(draft: { name: string; description: string }) => Promise<void>>(async () => {});
  const [name, setName] = useState(initialProject.name);
  const [description, setDescription] = useState(initialProject.description);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const lastSavedRef = useRef({ name: initialProject.name, description: initialProject.description });
  const latestDraftRef = useRef({ name: initialProject.name, description: initialProject.description });

  useEffect(() => {
    setName(initialProject.name);
    setDescription(initialProject.description);
    setSaveState("saved");
    setError(null);
    lastSavedRef.current = { name: initialProject.name, description: initialProject.description };
    latestDraftRef.current = { name: initialProject.name, description: initialProject.description };
  }, [initialProject.description, initialProject.name]);

  useEffect(() => {
    latestDraftRef.current = { name, description };
  }, [description, name]);

  const dirty = name !== lastSavedRef.current.name || description !== lastSavedRef.current.description;

  saveDraftRef.current = async (draft: { name: string; description: string }): Promise<void> => {
    const validationError = getValidationError(draft.name, draft.description);
    if (validationError) {
      setError(validationError);
      return;
    }
    const trimmedName = draft.name.trim();
    const trimmedDescription = draft.description.trim();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSaveState("saving");
    setError(null);
    try {
      const saved = await updateProjectSettings(initialProject.id, {
        name: trimmedName,
        description: trimmedDescription,
      });
      if (requestIdRef.current !== requestId) {
        return;
      }
      lastSavedRef.current = { name: saved.name, description: saved.description };
      latestDraftRef.current = { name: saved.name, description: saved.description };
      setName(saved.name);
      setDescription(saved.description);
      setSaveState("saved");
      onSaved?.(saved);
    } catch (reason) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setSaveState("failed");
      setError(reason instanceof Error ? reason.message : "Could not save project settings.");
    }
  };

  async function flushPendingSave(): Promise<void> {
    if (!dirty) {
      return;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    await saveDraftRef.current(latestDraftRef.current);
  }

  useEffect(() => {
    if (!dirty) {
      return;
    }
    setSaveState("unsaved");
    timeoutRef.current = window.setTimeout(() => {
      void saveDraftRef.current(latestDraftRef.current);
    }, 700);
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [description, dirty, initialProject.id, name]);

  useEffect(() => {
    const handlePageHide = () => {
      const draft = latestDraftRef.current;
      if (
        draft.name !== lastSavedRef.current.name ||
        draft.description !== lastSavedRef.current.description
      ) {
        const validationError = getValidationError(draft.name, draft.description);
        if (!validationError) {
          flushProjectSettingsKeepalive(initialProject.id, {
            name: draft.name.trim(),
            description: draft.description.trim(),
          });
        }
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      handlePageHide();
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [initialProject.id]);

  return (
    <section className="panel stack">
      <div className="page-header">
        <div className="section-header">
          <h2>{title}</h2>
          <p>{descriptionText}</p>
        </div>
        <span className={`status-pill status-pill-${saveState}`}>{getSaveStateLabel(saveState)}</span>
      </div>
      <div className="form-grid">
        <label className="field field-span-2">
          <span>Project name</span>
          <input minLength={2} onBlur={() => void flushPendingSave()} onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label className="field field-span-2">
          <span>Description</span>
          <textarea onBlur={() => void flushPendingSave()} onChange={(event) => setDescription(event.target.value)} rows={5} value={description} />
        </label>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
