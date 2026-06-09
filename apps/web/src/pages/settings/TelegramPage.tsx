import { FormEvent, useEffect, useState } from "react";

import { useAppSettings } from "@/hooks/useAppSettings";
import {
  createTelegramBot,
  fetchTelegramPollerStatus,
  importLegacyTelegramBots,
  pollTelegramOnce,
  startTelegramPoller,
  stopTelegramPoller,
} from "@/lib/backend";
import type { TelegramPollerStatus } from "@/lib/types";

export function TelegramPage() {
  const { settings, apiOnline, refresh, setFlash } = useAppSettings();
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pollerBusy, setPollerBusy] = useState(false);
  const [pollerStatus, setPollerStatus] = useState<TelegramPollerStatus | null>(null);
  const bots = settings?.telegram_bots ?? [];
  const models = settings?.model_links ?? [];

  async function refreshPollerStatus() {
    const result = await fetchTelegramPollerStatus();
    if (result.ok) setPollerStatus(result.status);
  }

  useEffect(() => {
    if (!apiOnline) return;
    void refreshPollerStatus();
    const timer = window.setInterval(() => {
      void refreshPollerStatus();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [apiOnline]);

  async function importLegacy() {
    setImporting(true);
    const result = await importLegacyTelegramBots();
    setImporting(false);
    if (!result.ok) {
      setFlash(result.error ?? "Import failed.", true);
      return;
    }
    setFlash(result.imported ? `Imported ${result.imported} bot(s) from legacy runtime.` : "No legacy bots found to import.");
    await refresh();
  }

  async function addBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const botToken = String(form.get("bot_token") || "").trim();
    const chatId = String(form.get("chat_id") || "").trim();
    if (!name || !botToken || !chatId) {
      setFlash("Name, token, and chat ID are required.", true);
      return;
    }
    setSaving(true);
    const response = await createTelegramBot({
      name,
      bot_token: botToken,
      allowed_chat_id: chatId,
      model_key: String(form.get("model_key") || "snake_policy"),
      enabled: true,
    });
    setSaving(false);
    if (!response.ok) {
      setFlash(response.error ?? "Could not save bot.", true);
      return;
    }
    setFlash(response.bot?.live_verified ? `Bot “${name}” connected.` : `Bot “${name}” saved (token not verified).`);
    event.currentTarget.reset();
    await refresh();
    await refreshPollerStatus();
  }

  async function setPoller(action: "start" | "stop" | "poll") {
    setPollerBusy(true);
    if (action === "poll") {
      const result = await pollTelegramOnce();
      setPollerBusy(false);
      if (!result.ok || !result.data) {
        setFlash(result.error ?? "Telegram poll failed.", true);
        return;
      }
      setFlash(
        `Poll complete: ${result.data.updates_seen} update(s), ${result.data.messages_sent} reply/replies, ${result.data.feedback_saved} feedback row(s).`,
      );
      await refreshPollerStatus();
      return;
    }
    const result = action === "start" ? await startTelegramPoller() : await stopTelegramPoller();
    setPollerBusy(false);
    if (!result.ok || !result.data) {
      setFlash(result.error ?? "Telegram worker command failed.", true);
      return;
    }
    setPollerStatus(result.data);
    setFlash(action === "start" ? "Telegram worker started." : "Telegram worker stopped.");
  }

  return (
    <section className="panel stack settings-section">
      <div className="panel-header compact-header">
        <h2>Telegram bots</h2>
        <span className="settings-header-meta">{bots.length} saved</span>
      </div>
      <p className="field-hint">
        Create model and notification bots here. Chipmunk Telegram is owned by the official Hermes gateway on the
        Chipmunk page.
      </p>

      <div className="settings-status-card">
        <div className="settings-backend-copy">
          <strong>Telegram worker</strong>
          <span className={pollerStatus?.running ? "ok-text" : "warn-text"}>
            {pollerStatus?.running ? "running on this laptop" : "stopped"}
            {pollerStatus?.last_error ? ` · ${pollerStatus.last_error}` : ""}
          </span>
          {pollerStatus ? (
            <span className="field-hint">
              last poll: {pollerStatus.last_result.updates_seen} update(s), {pollerStatus.last_result.messages_sent} reply/replies,{" "}
              {pollerStatus.last_result.feedback_saved} feedback row(s)
            </span>
          ) : null}
        </div>
        <div className="loop-action-row">
          <button className="secondary" disabled={!apiOnline || pollerBusy} type="button" onClick={() => void setPoller("start")}>
            Start worker
          </button>
          <button className="secondary" disabled={!apiOnline || pollerBusy} type="button" onClick={() => void setPoller("stop")}>
            Stop worker
          </button>
          <button className="secondary" disabled={!apiOnline || pollerBusy} type="button" onClick={() => void setPoller("poll")}>
            Poll now
          </button>
        </div>
      </div>

      <div className="loop-action-row">
        <button className="secondary" disabled={!apiOnline || importing} type="button" onClick={importLegacy}>
          {importing ? "Importing…" : "Import from ~/.brain-spa-runtime"}
        </button>
      </div>

      <ul className="settings-backend-list">
        {bots.length === 0 ? (
          <li className="settings-empty-row">No bots yet. Add one below.</li>
        ) : (
          bots.map((bot) => (
            <li className="settings-backend-item" key={bot.name}>
              <div className="settings-backend-copy">
                <strong>{bot.name}</strong>
                <span className={bot.live_verified ? "ok-text" : "warn-text"}>
                  model: {bot.model_key}
                  {bot.live_verified ? " · verified" : " · not verified"}
                  {bot.allowed_chat_id_configured ? " · chat ID set" : " · no chat ID"}
                </span>
              </div>
              <span className={`status-pill ${bot.live_verified ? "status-pill-live" : "status-pill-offline"}`}>
                {bot.live_verified ? "Connected" : "Check token"}
              </span>
            </li>
          ))
        )}
      </ul>

      <form className="settings-fields settings-fields-bordered" onSubmit={addBot}>
        <h3 className="settings-subheading">Add bot</h3>
        <label className="field">
          <span>Name</span>
          <input name="name" placeholder="snake-policy" required />
          <small className="field-hint">Use model or notification names such as snake-policy, notify-evidence, or tune-alerts.</small>
        </label>
        <label className="field">
          <span>Bot token</span>
          <input name="bot_token" required type="password" autoComplete="off" />
        </label>
        <label className="field">
          <span>Your chat ID</span>
          <input name="chat_id" inputMode="numeric" placeholder="123456789" required />
        </label>
        <label className="field">
          <span>Model</span>
          <select name="model_key" defaultValue="snake_policy">
            {models.map((m) => (
              <option key={m.model_key} value={m.model_key}>
                {m.model_label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={!apiOnline || saving} type="submit">
          {saving ? "Saving…" : "Save bot"}
        </button>
      </form>
    </section>
  );
}
