"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { APP_NAME } from "@/lib/brand";
import {
  loadRecentProject,
  parseProjectPathname,
  RECENT_PROJECT_EVENT,
  type RecentProjectLocation,
} from "@/lib/recent-project";

function isGuestRoute(pathname: string): boolean {
  return pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth/");
}

function isRunDetailRoute(pathname: string): boolean {
  return /^\/runs\/[^/]+/.test(pathname);
}

function getProjectNav(match: ReturnType<typeof parseProjectPathname>): Array<{ href: string; label: string; active: boolean }> | null {
  if (!match) {
    return null;
  }
  const projectId = match.projectId;
  const section = match.sectionKey;
  return [
    { href: "/", label: "Projects", active: false },
    { href: `/projects/${projectId}/persona`, label: "Persona", active: section === "persona" },
    { href: `/projects/${projectId}/transcripts`, label: "Transcripts", active: section === "transcripts" },
    { href: `/projects/${projectId}/runs`, label: "Runs", active: section === "runs" },
  ];
}

function getBrandLabel(
  pathname: string,
  projectMatch: ReturnType<typeof parseProjectPathname>,
  recentProject: RecentProjectLocation | null
): string {
  if (projectMatch) {
    if (recentProject?.projectId === projectMatch.projectId) {
      return recentProject.projectName;
    }
    return `Project #${projectMatch.projectId}`;
  }
  if (pathname === "/settings") {
    return "Account";
  }
  if (isRunDetailRoute(pathname)) {
    return "Runs";
  }
  return "Workspace list";
}

export function AppChrome() {
  const pathname = usePathname();
  const [recentProject, setRecentProject] = useState<RecentProjectLocation | null>(() => loadRecentProject());

  useEffect(() => {
    function handleRecentProjectUpdate(event: Event): void {
      if (event instanceof CustomEvent && event.detail) {
        setRecentProject(event.detail as RecentProjectLocation);
        return;
      }
      setRecentProject(loadRecentProject());
    }

    window.addEventListener(RECENT_PROJECT_EVENT, handleRecentProjectUpdate as EventListener);
    window.addEventListener("storage", handleRecentProjectUpdate);
    return () => {
      window.removeEventListener(RECENT_PROJECT_EVENT, handleRecentProjectUpdate as EventListener);
      window.removeEventListener("storage", handleRecentProjectUpdate);
    };
  }, []);

  if (isGuestRoute(pathname)) {
    return null;
  }

  const projectMatch = parseProjectPathname(pathname);
  const projectNav = getProjectNav(projectMatch);
  const navItems = projectNav ?? [
    { href: "/", label: "Projects", active: pathname === "/" },
    { href: "/models", label: "Models", active: pathname === "/models" },
    { href: "/datasets", label: "Datasets", active: pathname === "/datasets" },
    { href: "/transcripts", label: "Transcripts", active: pathname === "/transcripts" },
    { href: "/settings", label: "Settings", active: pathname === "/settings" },
  ];
  const brandLabel = getBrandLabel(pathname, projectMatch, recentProject);
  const showResumeLink = Boolean(recentProject && !projectMatch && !isRunDetailRoute(pathname));

  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <span className="brand-mark" />
        <span className="brand-copy">
          <strong>{APP_NAME}</strong>
          <span className="brand-label">{brandLabel}</span>
        </span>
      </Link>
      <div className="topbar-actions">
        <nav className="topnav">
          {navItems.map((item) => (
            <Link
              aria-current={item.active ? "page" : undefined}
              className={`nav-link${item.active ? " nav-link-active" : ""}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {showResumeLink && recentProject ? (
          <Link className="resume-link" href={recentProject.href}>
            <strong>{recentProject.projectName}</strong>
            <span className="resume-section">{recentProject.sectionLabel}</span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}
