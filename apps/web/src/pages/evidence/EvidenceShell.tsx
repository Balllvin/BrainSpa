import type { ReactNode } from "react";

import { LoopNavArrow } from "@/components/loop/LoopNavArrow";

export function EvidenceShell({
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
    <section className="evidence-stage">
      <header className={`evidence-stage-header${backTo ? "" : " evidence-stage-header--root"}`}>
        {backTo ? <LoopNavArrow to={backTo} label={backLabel ?? "Back"} /> : null}
        <h1 className="evidence-stage-title">{title}</h1>
      </header>
      {children}
    </section>
  );
}
