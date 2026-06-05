import type { ReactNode } from "react";

import { TestNavArrow } from "../TestNav";

export function SnakeShell({ backTo, children }: { backTo: string; children: ReactNode }) {
  return (
    <section className="snake-page">
      <TestNavArrow to={backTo} label="Back" />
      <div className="snake-page-body">{children}</div>
    </section>
  );
}