import { useEffect, useRef, useState } from "react";

import { streamBackendConnect } from "@/lib/backend";
import type { AgentBackendKey, ConnectStreamEvent } from "@/lib/types";

const MANUAL_INSTALL: Partial<Record<AgentBackendKey, string[]>> = {
  cursor: [
    "Open the Cursor app on this Mac.",
    "Press Cmd+Shift+P and run: Shell Command: Install 'cursor' command in PATH.",
    "Restart the terminal, then reload Settings.",
  ],
};

type Props = {
  backendKey: AgentBackendKey;
  label: string;
  onClose: () => void;
  onComplete: () => void;
};

export function InstallPanel({ backendKey, label, onClose, onComplete }: Props) {
  const logRef = useRef<HTMLPreElement>(null);
  const started = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const logsRef = useRef<string[]>([]);
  const [, bump] = useState(0);

  const manual = MANUAL_INSTALL[backendKey];

  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (manual || started.current) return;
    started.current = true;
    logsRef.current = [`Installing ${label}…`];
    bump((n) => n + 1);

    const stop = streamBackendConnect(backendKey, (event: ConnectStreamEvent) => {
      const line =
        event.type === "log" || event.type === "done" || event.type === "error" ? event.message : "";
      if (line) {
        logsRef.current = [...logsRef.current, line];
        bump((n) => n + 1);
      }
      if (event.type === "done" || event.type === "error") {
        onCompleteRef.current();
      }
    });
    return () => {
      stop();
      started.current = false;
    };
  }, [backendKey, label, manual]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  });

  return (
    <div className="connect-panel">
      <div className="connect-panel-header">
        <strong>{manual ? `Install ${label} manually` : `Installing ${label}`}</strong>
        <button className="secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {manual ? (
        <ol className="settings-manual-steps">
          {manual.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : (
        <pre ref={logRef} className="connect-log">
          {logsRef.current.join("\n")}
        </pre>
      )}
    </div>
  );
}
