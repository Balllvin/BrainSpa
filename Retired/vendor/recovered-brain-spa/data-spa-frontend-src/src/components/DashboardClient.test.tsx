import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardClient } from "@/components/DashboardClient";
import { render } from "@/test/render";
import type { ProjectSummary } from "@/lib/types";

const push = vi.fn();
const refresh = vi.fn();
const createProject = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/api", () => ({
  createProject: (...args: unknown[]) => createProject(...args),
}));

function buildProjectSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 1,
    name: "Persona A",
    description: "Sharper answers",
    learning_goal: "hybrid",
    status: "active",
    created_at: "2026-04-19T10:00:00Z",
    updated_at: "2026-04-19T10:00:00Z",
    transcript_count: 3,
    run_count: 1,
    ...overrides,
  };
}

describe("DashboardClient", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    createProject.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a single dashboard heading and the simplified create form in the empty state", async () => {
    const view = await render(<DashboardClient initialProjects={[]} />);

    expect(view.container.querySelectorAll("h1")).toHaveLength(1);
    expect(view.container.querySelector("h1")?.textContent).toBe("Projects");
    expect(view.container.querySelector('input[name="name"]')).not.toBeNull();
    expect(view.container.querySelector('textarea[name="description"]')).not.toBeNull();
    expect(view.container.textContent).toContain("Name the workspace and what it should improve.");
    expect(view.container.textContent).toContain("Description");
    expect(view.container.querySelector("h2")).toBeNull();
    expect(view.container.textContent).toContain("No projects yet.");

    await view.unmount();
  });

  it("renders project rows without a duplicate projects section heading", async () => {
    const view = await render(
      <DashboardClient initialProjects={[buildProjectSummary(), buildProjectSummary({ id: 2, name: "Persona B" })]} />
    );

    const rowTitles = Array.from(view.container.querySelectorAll(".project-row h3")).map((node) => node.textContent);
    expect(rowTitles).toEqual(["Persona A", "Persona B"]);
    expect(view.container.textContent).toContain("Open a workspace or start a new one.");
    expect(Array.from(view.container.querySelectorAll("h2")).map((node) => node.textContent)).toEqual([]);

    await view.unmount();
  });

  it("submits the create form and redirects to the new project", async () => {
    createProject.mockResolvedValue(buildProjectSummary({ id: 9, name: "Operator", description: "Make answers sharper." }));

    const view = await render(<DashboardClient initialProjects={[]} />);
    const nameInput = view.container.querySelector('input[name="name"]') as HTMLInputElement;
    const goalInput = view.container.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
    const form = view.container.querySelector("form") as HTMLFormElement;

    nameInput.value = "Operator";
    goalInput.value = "Make answers sharper.";
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createProject).toHaveBeenCalledWith({
      name: "Operator",
      description: "Make answers sharper.",
    });
    expect(push).toHaveBeenCalledWith("/projects/9");

    await view.unmount();
  });

  it("shows the API error when project creation fails", async () => {
    createProject.mockRejectedValue(new Error("Goal is too short"));

    const view = await render(<DashboardClient initialProjects={[]} />);
    const nameInput = view.container.querySelector('input[name="name"]') as HTMLInputElement;
    const goalInput = view.container.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
    const form = view.container.querySelector("form") as HTMLFormElement;

    nameInput.value = "Operator";
    goalInput.value = "bad";
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(view.container.textContent).toContain("Goal is too short");
    expect(push).not.toHaveBeenCalled();

    await view.unmount();
  });
});
