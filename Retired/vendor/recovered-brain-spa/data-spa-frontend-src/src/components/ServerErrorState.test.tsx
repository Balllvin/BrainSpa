import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => <a className={className} href={href}>{children}</a>,
}));

import { ServerErrorState } from "@/components/ServerErrorState";

describe("ServerErrorState", () => {
  it("renders compact backend-unavailable copy with actions", () => {
    const markup = renderToStaticMarkup(
      <ServerErrorState
        primaryActionHref="/auth/refresh?next=%2F"
        primaryActionLabel="Retry"
        secondaryActionHref="/login?next=%2F"
        secondaryActionLabel="Sign in"
        variant="backend-unavailable"
      />
    );

    expect(markup).toContain("We couldn&#x27;t reach the backend.");
    expect(markup).toContain("Retry");
    expect(markup).toContain("Sign in");
  });
});
