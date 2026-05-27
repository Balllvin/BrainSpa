import React from "react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { ProjectSummary } from "@/lib/types";

type WorkspaceSection = "settings" | "persona" | "transcripts" | "runs";

const WORKSPACE_NAV: Array<{ key: WorkspaceSection; label: string }> = [
  { key: "settings", label: "Settings" },
  { key: "persona", label: "Persona" },
  { key: "transcripts", label: "Transcripts" },
  { key: "runs", label: "Runs" },
];

export function ProjectWorkspaceFrame({
  activeSection,
  children,
  project,
}: {
  activeSection: WorkspaceSection;
  children: ReactNode;
  project: ProjectSummary;
}) {
  return (
    <div className="page-grid">
      <section className="panel stack compact-page-panel">
        <div className="stack tight">
          <h1>{project.name}</h1>
          <p className="muted">{project.description}</p>
        </div>
        <nav className="workspace-nav">
          {WORKSPACE_NAV.map((item) => {
            const href = `/projects/${project.id}/${item.key}`;
            const isActive = item.key === activeSection;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`workspace-nav-link${isActive ? " workspace-nav-link-active" : ""}`}
                href={href}
                key={item.key}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </section>
      {children}
    </div>
  );
}
