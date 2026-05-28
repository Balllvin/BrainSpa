import { useState } from "react";

import { InstallPanel } from "@/components/settings/InstallPanel";
import { connectBackendQuick } from "@/lib/backend";
import { useAppSettings } from "@/hooks/useAppSettings";
import type { AgentBackendKey, BackendStatus } from "@/lib/types";

const LOOP_CLIS: AgentBackendKey[] = ["codex", "opencode", "grok", "cursor"];

export function ConnectionsPage() {
  const { settings, loading, apiOnline, refresh, setFlash } = useAppSettings();
  const [installing, setInstalling] = useState<AgentBackendKey | null>(null);

  const hermes = settings?.backends.find((b) => b.key === "hermes");
  const clis = settings?.backends.filter((b) => LOOP_CLIS.includes(b.key)) ?? [];

  async function installCli(key: AgentBackendKey) {
    if (key === "cursor") {
      setInstalling("cursor");
      return;
    }
    const quick = await connectBackendQuick(key);
    if (!quick.ok) {
      setFlash(quick.error ?? "Install failed.", true);
      return;
    }
    if (quick.connected) {
      setFlash(`${labelFor(key)} is ready.`);
      await refresh();
      return;
    }
    if (quick.needsStream) {
      setInstalling(key);
      return;
    }
    setFlash(`Could not install ${labelFor(key)}.`, true);
  }

  return (
    <section className="panel stack settings-section">
      <div className="panel-header compact-header">
        <h2>Connections</h2>
        <span className="settings-header-meta">
          {loading ? "…" : `${clis.filter((c) => c.connected).length} of ${LOOP_CLIS.length} CLIs ready`}
        </span>
      </div>

      <p className="field-hint">
        If a CLI is already on your Mac, it shows as Ready. Install only adds missing tools — no sign-in step here.
      </p>

      <article className="settings-status-card">
        <div className="settings-status-card-head">
          <strong>Chipmunk (Hermes)</strong>
          <span className={`status-pill ${hermes?.connected ? "status-pill-live" : "status-pill-offline"}`}>
            {hermes?.connected ? "Ready" : "Not found"}
          </span>
        </div>
        <p className="field-hint">
          {hermes?.connected
            ? `Detected at ${shortPath(hermes.command_path) ?? "PATH"}. No button — automatic.`
            : "Install Hermes on PATH (pip install hermes-agent). Brain Spa detects it on reload."}
        </p>
      </article>

      <ul className="settings-backend-list">
        {clis.map((backend) => (
          <CliRow
            apiOnline={apiOnline}
            backend={backend}
            key={backend.key}
            loading={loading}
            onInstall={() => installCli(backend.key)}
          />
        ))}
      </ul>

      {installing ? (
        <InstallPanel
          backendKey={installing}
          label={settings?.backends.find((b) => b.key === installing)?.label ?? installing}
          onClose={() => setInstalling(null)}
          onComplete={() => {
            setInstalling(null);
            setFlash("Install finished. Reload if the CLI still shows missing.");
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function CliRow({
  backend,
  loading,
  apiOnline,
  onInstall,
}: {
  backend: BackendStatus;
  loading: boolean;
  apiOnline: boolean;
  onInstall: () => void;
}) {
  return (
    <li className="settings-backend-item">
      <div className="settings-backend-copy">
        <strong>{backend.label}</strong>
        <span className={backend.connected ? "ok-text" : "warn-text"}>
          {loading ? "Checking…" : backend.connected ? backend.version ?? shortPath(backend.command_path) ?? "Ready" : "Not installed"}
        </span>
      </div>
      {backend.connected ? (
        <span className="status-pill status-pill-live">Ready</span>
      ) : (
        <button className="primary" disabled={!apiOnline} type="button" onClick={onInstall}>
          Install
        </button>
      )}
    </li>
  );
}

function labelFor(key: string) {
  return { codex: "Codex", opencode: "OpenCode", grok: "Grok", cursor: "Cursor" }[key] ?? key;
}

function shortPath(path: string | null | undefined) {
  if (!path) return null;
  return path.length <= 52 ? path : `…${path.slice(-48)}`;
}
