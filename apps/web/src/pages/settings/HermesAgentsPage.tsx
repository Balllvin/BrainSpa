import { useEffect, useState } from "react";

import { useAppSettings } from "@/hooks/useAppSettings";
import { updateLoopAgent } from "@/lib/backend";
import { fetchAgentSkills, type MlSkillWorker } from "@/lib/mlBackend";
import type { AgentBackendKey, LoopStageKey } from "@/lib/types";

const CLI_OPTIONS: AgentBackendKey[] = ["codex", "opencode", "grok", "cursor"];

export function HermesAgentsPage() {
  const { settings, loading, apiOnline, refresh, setFlash } = useAppSettings();
  const [workers, setWorkers] = useState<MlSkillWorker[]>([]);

  useEffect(() => {
    void fetchAgentSkills().then((res) => {
      if (res.ok && res.data) setWorkers(res.data.workers);
    });
  }, []);
  const readyClis = new Set(
    (settings?.backends ?? []).filter((b) => CLI_OPTIONS.includes(b.key) && b.connected).map((b) => b.key),
  );

  async function saveStage(
    stage: LoopStageKey,
    patch: { backend?: AgentBackendKey; telegram_bot_name?: string | null },
  ) {
    const result = await updateLoopAgent(stage, patch);
    if (!result.ok) {
      setFlash(result.error ?? "Could not save.", true);
      return;
    }
    setFlash(`Saved ${stage} harness.`);
    await refresh();
  }

  return (
    <section className="panel stack settings-section">
      <div className="panel-header compact-header">
        <h2>Stage harnesses</h2>
      </div>
      <p className="field-hint">
        Chipmunk is the supervising Hermes operator. These four loop stages are custom harnesses with their own CLI backend and optional Telegram notification bot.
      </p>

      <div className="settings-agent-grid">
        {(settings?.loop_agents ?? []).map((agent) => {
          const cliReady = readyClis.has(agent.backend);
          const bots = settings?.telegram_bots ?? [];

          return (
            <article className="settings-agent-card" key={agent.key}>
              <div className="settings-agent-card-head">
                <h3>{agent.label}</h3>
                <span className={`status-pill ${cliReady ? "status-pill-live" : "status-pill-offline"}`}>
                  {loading ? "…" : cliReady ? "CLI ready" : "CLI missing"}
                </span>
              </div>

              <label className="field">
                <span>CLI backend</span>
                <select
                  disabled={!apiOnline}
                  value={agent.backend}
                  onChange={(e) => {
                    void saveStage(agent.key, { backend: e.target.value as AgentBackendKey });
                  }}
                >
                  {CLI_OPTIONS.map((key) => (
                    <option disabled={!readyClis.has(key)} key={key} value={key}>
                      {labelBackend(key)}
                      {!readyClis.has(key) ? " (not installed)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Telegram bot</span>
                <select
                  disabled={!apiOnline}
                  value={agent.telegram_bot_name ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    void saveStage(agent.key, { telegram_bot_name: value || null });
                  }}
                >
                  <option value="">Not connected</option>
                  {bots.map((bot) => (
                    <option key={bot.name} value={bot.name}>
                      {bot.name}
                      {bot.live_verified ? "" : " (unverified)"}
                    </option>
                  ))}
                </select>
                {!bots.length ? (
                  <small className="field-hint">Add a bot on the Telegram page first.</small>
                ) : null}
              </label>
            </article>
          );
        })}
      </div>

      <div className="panel-header compact-header">
        <h2>Operator skills</h2>
      </div>
      <p className="field-hint">
        Concrete capabilities Chipmunk and the four resident worker models can run. Chipmunk routes free-text requests
        (e.g. “train cartpole with ppo”, “list runs”) to these skills.
      </p>
      <div className="skills-grid">
        {workers.map((worker) => (
          <article className="skills-card" key={worker.key}>
            <div className="skills-card-head">
              <h3>{worker.label}</h3>
              <span className="status-pill status-pill-offline">{worker.role}</span>
            </div>
            <p className="skills-card-summary">{worker.summary}</p>
            <ul className="skills-list">
              {worker.skills.map((skill) => (
                <li className="skills-item" key={skill.key}>
                  <span className="skills-item-label">{skill.label}</span>
                  <span className="skills-item-desc">{skill.description}</span>
                  {skill.example ? <code className="skills-item-example">“{skill.example}”</code> : null}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function labelBackend(key: string) {
  return { codex: "Codex", opencode: "OpenCode", grok: "Grok", cursor: "Cursor" }[key] ?? key;
}
