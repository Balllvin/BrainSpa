import { useEffect, useRef } from "react";

import { streamBackendConnect } from "@/lib/backend";
import type { AgentBackendKey, ConnectStreamEvent } from "@/lib/types";

type Props = {
  backendKey: AgentBackendKey;
  label: string;
  logs: string[];
  active: boolean;
  onLog: (line: string) => void;
  onDone: () => void;
  onClose: () => void;
};

export function ConnectStreamPanel({
  backendKey,
  label,
  logs,
  active,
  onLog,
  onDone,
  onClose,
}: Props) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!active) return;
    onLog(`Installing ${label}…`);
    const stop = streamBackendConnect(backendKey, (event: ConnectStreamEvent) => {
      if (event.type === "log" || event.type === "done" || event.type === "error") {
        onLog(event.message);
      }
      if (event.type === "done" || event.type === "error") {
        onDone();
      }
    });
    return stop;
  }, [active, backendKey, label, onDone, onLog]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  if (!active) return null;

  return (
    <div className="connect-panel">
      <div className="connect-panel-header">
        <strong>Installing {label}</strong>
        <button className="secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <pre ref={logRef} className="connect-log">
        {logs.join("\n")}
      </pre>
    </div>
  );
}
