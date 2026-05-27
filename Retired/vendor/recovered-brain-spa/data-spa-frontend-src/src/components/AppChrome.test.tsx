import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RECENT_PROJECT_EVENT, RECENT_PROJECT_STORAGE_KEY } from "@/lib/recent-project";
import { render } from "@/test/render";

const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

import { AppChrome } from "@/components/AppChrome";

describe("AppChrome", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("renders Data Spa branding with the root navigation outside project routes", async () => {
    pathnameMock.mockReturnValue("/");

    const view = await render(<AppChrome />);

    expect(view.container.textContent).toContain("Data Spa");
    expect(view.container.textContent).toContain("Projects");
    expect(view.container.textContent).toContain("Datasets");
    expect(view.container.textContent).toContain("Transcripts");
    expect(view.container.textContent).toContain("Settings");
    expect(view.container.textContent).not.toContain("Persona");
    expect(view.container.textContent).not.toContain("Runs");
    expect(view.container.textContent).not.toContain("Transcript Trainer");
    expect(view.container.textContent).not.toContain("Alvin");

    await view.unmount();
  });

  it("switches to project navigation in the top header on project routes", async () => {
    pathnameMock.mockReturnValue("/projects/9/persona");

    const view = await render(<AppChrome />);

    expect(view.container.textContent).toContain("Projects");
    expect(view.container.textContent).toContain("Persona");
    expect(view.container.textContent).toContain("Transcripts");
    expect(view.container.textContent).toContain("Runs");
    expect(view.container.textContent).not.toContain("Settings");

    await view.unmount();
  });

  it("shows a resume shortcut for the last opened project off project routes", async () => {
    window.localStorage.setItem(
      RECENT_PROJECT_STORAGE_KEY,
      JSON.stringify({
        projectId: 4,
        projectName: "Atlas",
        href: "/projects/4/transcripts",
        sectionLabel: "Transcripts",
      })
    );
    pathnameMock.mockReturnValue("/");

    const view = await render(<AppChrome />);

    expect(view.container.textContent).toContain("Atlas");
    expect(view.container.textContent).toContain("Transcripts");

    await view.unmount();
  });

  it("updates from the recent-project event path", async () => {
    pathnameMock.mockReturnValue("/");

    const view = await render(<AppChrome />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(RECENT_PROJECT_EVENT, {
          detail: {
            projectId: 8,
            projectName: "Beacon",
            href: "/projects/8/runs",
            sectionLabel: "Runs",
          },
        })
      );
    });

    expect(view.container.textContent).toContain("Beacon");
    expect(view.container.textContent).toContain("Runs");

    await view.unmount();
  });

  it("renders safely when local storage access fails", async () => {
    pathnameMock.mockReturnValue("/");
    const getItem = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const view = await render(<AppChrome />);

    expect(view.container.textContent).toContain("Data Spa");

    warn.mockRestore();
    getItem.mockRestore();
    await view.unmount();
  });
});
