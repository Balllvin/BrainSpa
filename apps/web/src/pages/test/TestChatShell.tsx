import type { FormEvent, ReactNode } from "react";

import { TestNavArrow } from "./TestNav";

export function TestChatShell({
  backTo,
  backLabel,
  title,
  children,
  composer,
}: {
  backTo: string;
  backLabel: string;
  title: string;
  children: ReactNode;
  composer: ReactNode;
}) {
  return (
    <div className="test-chat-stage">
      <header className="test-chat-topbar">
        <TestNavArrow to={backTo} label={backLabel} />
        <h1 className="test-chat-topbar-title">{title}</h1>
      </header>

      <div className="test-chat-stream">{children}</div>

      <footer className="test-chat-composer-wrap">{composer}</footer>
    </div>
  );
}

export function TestChatComposer({
  onSubmit,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <form className="test-chat-composer" onSubmit={onSubmit}>
      {children}
    </form>
  );
}
