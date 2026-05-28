import { useAppSettings } from "@/hooks/useAppSettings";
import { updateModelTelegram } from "@/lib/backend";

export function ModelsPage() {
  const { settings, apiOnline, refresh, setFlash } = useAppSettings();
  const links = settings?.model_links ?? [];
  const bots = settings?.telegram_bots ?? [];
  const trained = links.filter((m) => m.model_state === "active");

  async function saveModel(modelKey: string, botName: string | null) {
    const result = await updateModelTelegram(modelKey, botName);
    if (!result.ok) {
      setFlash(result.error ?? "Could not save.", true);
      return;
    }
    setFlash("Model notification saved.");
    await refresh();
  }

  return (
    <section className="panel stack settings-section">
      <div className="panel-header compact-header">
        <h2>Model notifications</h2>
      </div>
      <p className="field-hint">
        Optional: send Telegram alerts when a trained model finishes work. Skip this until you have an active trained model on Tune.
      </p>

      {trained.length === 0 ? (
        <p className="settings-empty-row">No active trained models yet. Train on Tune first, then return here.</p>
      ) : (
        <div className="routing-table">
          <div className="routing-head">
            <span>Model</span>
            <span>State</span>
            <span>Telegram bot</span>
          </div>
          {trained.map((link) => (
            <div className="routing-row" key={link.model_key}>
              <span className="routing-stage">{link.model_label}</span>
              <span className="routing-meta">{link.model_state}</span>
              <select
                disabled={!apiOnline}
                value={link.telegram_bot_name ?? ""}
                onChange={(e) => {
                  void saveModel(link.model_key, e.target.value || null);
                }}
              >
                <option value="">Not connected</option>
                {bots.map((bot) => (
                  <option key={bot.name} value={bot.name}>
                    {bot.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {links.length > trained.length ? (
        <details className="settings-details">
          <summary>All registry models ({links.length})</summary>
          <ul className="settings-registry-list">
            {links.map((link) => (
              <li key={link.model_key}>
                {link.model_label} · {link.model_state}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
