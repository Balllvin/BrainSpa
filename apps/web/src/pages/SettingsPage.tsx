import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  authorizeTelegramRoute,
  createTelegramBot,
  fetchBrainSpaOverview,
  runWorkerPreview,
} from "@/lib/backend";
import type { BrainSpaOverview, TelegramAuthorizationResult, WorkerRunResult } from "@/lib/types";

const WORKER_BACKENDS = ["codex", "opencode", "grok", "cursor"] as const;

export function SettingsPage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [worker, setWorker] = useState<WorkerRunResult | null>(null);
  const [telegramCheck, setTelegramCheck] = useState<TelegramAuthorizationResult | null>(null);

  async function refresh() {
    const result = await fetchBrainSpaOverview();
    setOverview(result.overview);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const toolMap = useMemo(() => new Map((overview?.tools ?? []).map((tool) => [tool.key, tool])), [overview]);
  const telegramReady = Boolean(overview?.telegram_bots.some((bot) => bot.enabled && bot.allowed_chat_id_configured && bot.live_verified));
  const hermesBinary = toolMap.get("hermes");
  const stockfish = toolMap.get("stockfish");

  async function saveBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    const response = await createTelegramBot({
      name: String(form.get("name") || "").trim(),
      bot_token: String(form.get("bot_token") || "").trim(),
      allowed_chat_id: String(form.get("allowed_chat_id") || "").trim() || undefined,
      model_key: String(form.get("model_key") || "persona_small"),
      enabled: true,
    });
    setSaving(false);
    if (!response.ok) {
      setNotice(response.error);
      return;
    }
    formElement.reset();
    setNotice(`Saved ${response.bot?.name}`);
    await refresh();
  }

  async function testTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await authorizeTelegramRoute(
      String(form.get("bot_name") || ""),
      String(form.get("chat_id") || ""),
      String(form.get("message") || "generate a dataset"),
    );
    if (result.data) setTelegramCheck(result.data);
  }

  async function verifyBackend(backend: string) {
    const result = await runWorkerPreview("dataset_builder", backend, "verify backend");
    if (result.data) setWorker(result.data);
  }

  return (
    <div className="settings-grid">
      <section className="panel stack">
        <div className="panel-header compact-header">
          <h1>Settings</h1>
          <span className={`status-pill ${telegramReady ? "status-pill-live" : "status-pill-offline"}`}>
            {telegramReady ? "telegram live" : "telegram needed"}
          </span>
        </div>
        <div className="settings-strip">
          <StatusBlock label="Hermes" value={hermesBinary?.available && telegramReady ? "live" : "blocked"} good={Boolean(hermesBinary?.available && telegramReady)} />
          <StatusBlock label="Workers" value={`${WORKER_BACKENDS.filter((key) => toolMap.get(key)?.available).length}/4`} good={Boolean(toolMap.get("codex")?.available)} />
          <StatusBlock label="Engines" value={stockfish?.available ? "ready" : "missing"} good={Boolean(stockfish?.available)} />
        </div>
      </section>

      <section className="panel stack">
        <div className="panel-header compact-header">
          <h2>Telegram</h2>
          <span className="tag">Chipmunk access</span>
        </div>
        <form className="settings-form" onSubmit={saveBot}>
          <input name="name" placeholder="Bot name" required />
          <input autoComplete="new-password" name="bot_token" placeholder="BotFather token" required type="password" />
          <input name="allowed_chat_id" placeholder="Allowed chat ID" required />
          <select name="model_key" defaultValue="persona_small">
            {(overview?.models ?? []).map((model) => (
              <option key={model.key} value={model.key}>{model.label}</option>
            ))}
          </select>
          <button className="primary" disabled={saving} type="submit">{saving ? "Saving" : "Save bot"}</button>
        </form>
        {notice ? <div className="run-line">{notice}</div> : null}
        <form className="settings-form" onSubmit={testTelegram}>
          <select name="bot_name">
            <option value="">Select bot</option>
            {(overview?.telegram_bots ?? []).map((bot) => (
              <option key={bot.name} value={bot.name}>{bot.name}{bot.live_verified ? "" : " · not live"}</option>
            ))}
          </select>
          <input name="chat_id" placeholder="Chat ID to test" required />
          <input name="message" defaultValue="generate a dataset" />
          <button className="secondary" type="submit">Test Telegram</button>
        </form>
        {telegramCheck ? (
          <div className={`result-line ${telegramCheck.authorized ? "result-ok" : "result-warn"}`}>
            {telegramCheck.authorized ? "allowed" : "blocked"} · {telegramCheck.reason}
          </div>
        ) : null}
      </section>

      <section className="panel stack">
        <div className="panel-header compact-header">
          <h2>Workers</h2>
          <span className="tag">agent backends</span>
        </div>
        <div className="settings-list">
          {WORKER_BACKENDS.map((key) => {
            const tool = toolMap.get(key);
            return (
              <article className="settings-row" key={key}>
                <div>
                  <strong>{labelForBackend(key)}</strong>
                  <span>{tool?.available ? tool.version ?? tool.command_path : tool?.setup_hint ?? "not found"}</span>
                </div>
                <button className="secondary" type="button" onClick={() => verifyBackend(key)}>
                  Verify
                </button>
              </article>
            );
          })}
        </div>
        {worker ? (
          <div className={`result-line ${worker.state === "complete" ? "result-ok" : "result-warn"}`}>
            {worker.backend} · {worker.state}
          </div>
        ) : null}
      </section>

      <section className="panel stack">
        <div className="panel-header compact-header">
          <h2>Engines</h2>
          <span className="tag">not agents</span>
        </div>
        <article className="settings-row">
          <div>
            <strong>Stockfish chess engine</strong>
            <span>{stockfish?.available ? stockfish.command_path : "not found"}</span>
          </div>
          <span className={`status-pill ${stockfish?.available ? "status-pill-live" : "status-pill-offline"}`}>
            {stockfish?.available ? "ready" : "missing"}
          </span>
        </article>
        <article className="settings-row">
          <div>
            <strong>Hermes controller</strong>
            <span>{hermesBinary?.available ? hermesBinary.command_path : "not found"}</span>
          </div>
          <span className={`status-pill ${hermesBinary?.available && telegramReady ? "status-pill-live" : "status-pill-offline"}`}>
            {hermesBinary?.available && telegramReady ? "live" : "blocked"}
          </span>
        </article>
      </section>
    </div>
  );
}

function StatusBlock({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={good ? "ok-text" : "warn-text"}>{value}</strong>
    </div>
  );
}

function labelForBackend(key: string) {
  return {
    codex: "Codex",
    opencode: "OpenCode",
    grok: "Grok",
    cursor: "Cursor",
  }[key] ?? key;
}
