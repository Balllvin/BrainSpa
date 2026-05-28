import { FormEvent, useState } from "react";

import { useAppSettings } from "@/hooks/useAppSettings";
import { patchChipmunkSettings } from "@/lib/backend";

export function ChipmunkSettingsPage() {
  const { settings, apiOnline, refresh, setFlash } = useAppSettings();
  const chipmunk = settings?.chipmunk;
  const bots = settings?.telegram_bots ?? [];
  const models = settings?.model_links ?? [];
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await patchChipmunkSettings({
      xai_api_key: String(form.get("xai_api_key") || "").trim() || undefined,
      default_model_key: String(form.get("default_model_key") || "persona_small"),
      default_telegram_bot_name: String(form.get("default_telegram_bot_name") || "") || null,
      voice_model: String(form.get("voice_model") || "grok-voice-think-fast-1.0"),
      clear_xai_api_key: form.get("clear_xai") === "on",
    });
    setSaving(false);
    if (!result.ok) {
      setFlash(result.error ?? "Could not save.", true);
      return;
    }
    setFlash("Chipmunk settings saved.");
    event.currentTarget.reset();
    await refresh();
  }

  return (
    <section className="panel stack settings-section">
      <div className="panel-header compact-header">
        <h2>Chipmunk</h2>
        <span className={`status-pill ${chipmunk?.xai_configured ? "status-pill-live" : "status-pill-offline"}`}>
          {chipmunk?.xai_configured ? "Voice ready" : "No xAI key"}
        </span>
      </div>
      <p className="field-hint">
        Hermes coordinates loop agents. Chipmunk voice uses xAI Grok Voice Think Fast (press-to-talk on the Chipmunk page).
      </p>

      <form className="settings-fields" onSubmit={save}>
        <label className="field">
          <span>xAI API key</span>
          <input name="xai_api_key" type="password" autoComplete="off" placeholder={chipmunk?.xai_configured ? "•••••••• (leave blank to keep)" : "xai-…"} />
          <small className="field-hint">Or set XAI_API_KEY in your shell. Never shown after save.</small>
        </label>
        <label className="field settings-check">
          <input name="clear_xai" type="checkbox" />
          <span>Clear saved xAI key</span>
        </label>
        <label className="field">
          <span>Default model (Telegram / routing)</span>
          <select name="default_model_key" defaultValue={chipmunk?.default_model_key ?? "persona_small"}>
            {models.map((m) => (
              <option key={m.model_key} value={m.model_key}>
                {m.model_label} ({m.model_state})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Default Telegram bot</span>
          <select name="default_telegram_bot_name" defaultValue={chipmunk?.default_telegram_bot_name ?? ""}>
            <option value="">None</option>
            {bots.map((bot) => (
              <option key={bot.name} value={bot.name}>
                {bot.name} → {bot.model_key}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Voice model</span>
          <input name="voice_model" defaultValue={chipmunk?.voice_model ?? "grok-voice-think-fast-1.0"} />
        </label>
        <button className="primary" disabled={!apiOnline || saving} type="submit">
          {saving ? "Saving…" : "Save Chipmunk"}
        </button>
      </form>
    </section>
  );
}
