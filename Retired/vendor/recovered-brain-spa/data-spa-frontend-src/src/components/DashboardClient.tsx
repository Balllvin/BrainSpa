"use client";

import React from "react";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createProject } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";

export function DashboardClient({
  initialProjects,
}: {
  initialProjects: ProjectSummary[];
}) {
  const router = useRouter();
  const hasProjects = initialProjects.length > 0;
  const introText = hasProjects ? "Open a workspace or start a new one." : "Name the workspace and what it should improve.";
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    const formData = new FormData(event.currentTarget);

    try {
      const project = await createProject({
        name: String(formData.get("name") || ""),
        description: String(formData.get("description") || ""),
      });
      router.push(`/projects/${project.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create project");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="panel stack workspace-panel">
        <div className="page-title-block">
          <h1>Projects</h1>
          <p className="muted">{introText}</p>
        </div>
        <form className="create-grid" onSubmit={handleCreate}>
          <label className="field">
            <span>Name</span>
            <input minLength={2} name="name" placeholder="Project name…" required />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              minLength={4}
              name="description"
              placeholder="What should this project change about the model’s behavior?"
              required
              rows={3}
            />
          </label>
          <button className="primary" disabled={creating} type="submit">
            {creating ? "Creating…" : "Create Project"}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        <div className="row-group">
          {hasProjects ? (
            initialProjects.map((project) => (
              <Link className="project-row" href={`/projects/${project.id}`} key={project.id}>
                <div className="project-row-content stack tight">
                  <h3>{project.name}</h3>
                  <p>{project.description || "No description yet."}</p>
                </div>
                <dl className="project-stats project-row-meta">
                  <div>
                    <dt>Transcripts</dt>
                    <dd>{project.transcript_count}</dd>
                  </div>
                  <div>
                    <dt>Runs</dt>
                    <dd>{project.run_count}</dd>
                  </div>
                </dl>
              </Link>
            ))
          ) : (
            <p className="empty-state-text">No projects yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
