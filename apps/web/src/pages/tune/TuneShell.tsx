import type { ReactNode } from "react";

import { TuneNavArrow } from "./TuneNav";

export function TuneShell({
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
    <section className="tune-stage">
      <header className={`tune-stage-header${backTo ? "" : " tune-stage-header--root"}`}>
        {backTo ? <TuneNavArrow to={backTo} label={backLabel ?? "Back"} /> : null}
        <h1 className="tune-stage-title">{title}</h1>
      </header>
      {children}
    </section>
  );
}
