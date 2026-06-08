import type { ReactNode } from "react";

import { TestNavArrow } from "../TestNav";

export function SnakeShell({
  backTo,
  children,
  headerAside,
  variant = "default",
}: {
  backTo: string;
  children: ReactNode;
  headerAside?: ReactNode;
  variant?: "default" | "lab";
}) {
  return (
    <section className={`snake-page${variant === "lab" ? " snake-page--lab" : ""}`}>
      <div className="snake-page-head">
        <TestNavArrow to={backTo} label="Back" />
        {headerAside ? <div className="snake-page-head-aside">{headerAside}</div> : null}
      </div>
      <div className="snake-page-body">{children}</div>
    </section>
  );
}
