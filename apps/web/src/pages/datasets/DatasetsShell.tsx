import type { ReactNode } from "react";

import { DatasetsNavArrow } from "./DatasetsNav";

export function DatasetsShell({
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
    <section className="datasets-stage">
      <header className={`datasets-stage-header${backTo ? "" : " datasets-stage-header--root"}`}>
        {backTo ? <DatasetsNavArrow to={backTo} label={backLabel ?? "Back"} /> : null}
        <h1 className="datasets-stage-title">{title}</h1>
      </header>
      {children}
    </section>
  );
}
