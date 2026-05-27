"use client";

import { useEffect } from "react";

import { saveRecentProject } from "@/lib/recent-project";
import type { ProjectSummary } from "@/lib/types";

export function useRecentProjectSync(project: Pick<ProjectSummary, "id" | "name">): void {
  const { id, name } = project;

  useEffect(() => {
    saveRecentProject({ id, name }, window.location.pathname);
  }, [id, name]);
}
