import type { ReactNode } from "react";

import { TestNavArrow } from "./TestNav";

export function TestShell({
  backTo,
  backLabel,
  title,
  children,
}: {
  backTo?: string;
  backLabel?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="test-stage">
      <header className={`test-stage-header${backTo ? "" : " test-stage-header--root"}`}>
        {backTo ? <TestNavArrow to={backTo} label={backLabel ?? "Back"} /> : null}
        <h1 className="test-stage-title">{title}</h1>
      </header>
      {children}
    </section>
  );
}
