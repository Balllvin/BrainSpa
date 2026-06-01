import { ChangeEvent, FocusEvent, FormEvent, useEffect, useRef, useState } from "react";

import { useAppSettings } from "@/hooks/useAppSettings";
import { connectHermesProvider, patchChipmunkSettings } from "@/lib/backend";
import type { ChipmunkHermesStatus, HermesProviderStatus } from "@/lib/types";

const DEFAULT_PROVIDER = "openai-codex";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api/codex";
const DEFAULT_VOICE_MODEL = "grok-voice-think-fast-1.0";

export function ChipmunkSettingsPage() {
  const { settings, apiOnline, refresh, setFlash } = useAppSettings();
  const chipmunk = settings?.chipmunk;
  const hermes = chipmunk?.hermes ?? null;
  const providers = settings?.hermes_providers ?? [];
  const formRef = useRef<HTMLFormElement | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, []);

  async function saveForm(formElement: HTMLFormElement, includeSecret = false) {
    const form = new FormData(formElement);
    const result = await patchChipmunkSettings({
      voice_model: field(form, "voice_model") || DEFAULT_VOICE_MODEL,
      xai_api_key: includeSecret ? field(form, "xai_api_key") || undefined : undefined,
      clear_xai_api_key: form.get("clear_xai") === "on",
      restart_gateway: true,
      hermes: {
        provider: field(form, "provider") || DEFAULT_PROVIDER,
        model: field(form, "model") || DEFAULT_MODEL,
        base_url: field(form, "base_url") || DEFAULT_BASE_URL,
        reasoning_effort: field(form, "reasoning_effort") || "high",
        service_tier: field(form, "service_tier") || "normal",
        max_turns: numberField(form, "max_turns"),
        gateway_timeout: numberField(form, "gateway_timeout"),
        telegram_allowed_users: field(form, "telegram_allowed_users") || null,
        telegram_home_channel: field(form, "telegram_home_channel") || null,
      },
    });
    if (!result.ok) {
      setFlash(result.error ?? "Could not save Chipmunk Hermes settings.", true);
      return;
    }
    setFlash("Chipmunk Hermes auto-saved and restarted.");
    if (includeSecret) {
      const secretField = formElement.elements.namedItem("xai_api_key");
      if (secretField instanceof HTMLInputElement) secretField.value = "";
    }
    await refresh();
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveForm(event.currentTarget, true);
  }

  function scheduleAutosave(includeSecret = false) {
    if (!apiOnline || !formRef.current) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      if (formRef.current) void saveForm(formRef.current, includeSecret);
    }, includeSecret ? 0 : 800);
  }

  function autosaveField(event: ChangeEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.name === "xai_api_key") return;
    scheduleAutosave();
  }

  function autosaveSecret(event: FocusEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== "xai_api_key" || !target.value.trim()) return;
    scheduleAutosave(true);
  }

  async function connectProvider(provider: HermesProviderStatus) {
    setConnectingProvider(provider.key);
    const result = await connectHermesProvider(provider.key);
    setConnectingProvider(null);
    if (!result.ok || !result.data) {
      setFlash(result.error ?? "Hermes provider connect failed.", true);
      return;
    }
    setFlash(result.data.message, !result.data.connected);
    await refresh();
  }

  return (
    <section className="panel stack settings-section">
      <StatusGrid hermes={hermes} xaiConfigured={Boolean(chipmunk?.xai_configured)} />

      <form
        className="settings-fields settings-fields-bordered"
        ref={formRef}
        onBlur={autosaveSecret}
        onChange={autosaveField}
        onSubmit={save}
      >
        <div className="settings-two-column">
          <label className="field">
            <span>Hermes provider</span>
            <select name="provider" defaultValue={hermes?.provider || DEFAULT_PROVIDER}>
              {providerOptions(providers, hermes?.provider).map((provider) => (
                <option key={provider.key} value={provider.key}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Model</span>
            <input name="model" defaultValue={hermes?.model || DEFAULT_MODEL} />
          </label>
        </div>

        <label className="field">
          <span>Provider base URL</span>
          <input name="base_url" defaultValue={hermes?.base_url || DEFAULT_BASE_URL} />
        </label>

        <div className="settings-two-column">
          <label className="field">
            <span>Thinking</span>
            <select name="reasoning_effort" defaultValue={hermes?.reasoning_effort || "high"}>
              <option value="minimal">Minimal</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">Extra high</option>
            </select>
          </label>
          <label className="field">
            <span>Speed tier</span>
            <select name="service_tier" defaultValue={hermes?.service_tier || "normal"}>
              <option value="normal">Normal, non-fast</option>
              <option value="fast">Fast / priority</option>
            </select>
          </label>
        </div>

        <div className="settings-two-column">
          <label className="field">
            <span>Max turns</span>
            <input min={1} name="max_turns" type="number" defaultValue={hermes?.max_turns ?? 25} />
          </label>
          <label className="field">
            <span>Gateway timeout seconds</span>
            <input min={0} name="gateway_timeout" type="number" defaultValue={hermes?.gateway_timeout ?? 120} />
          </label>
        </div>

        <div className="settings-two-column">
          <label className="field">
            <span>Telegram allowed users</span>
            <input name="telegram_allowed_users" defaultValue={hermes?.telegram_allowed_users ?? ""} />
            <small className="field-hint">Official Hermes env: TELEGRAM_ALLOWED_USERS.</small>
          </label>
          <label className="field">
            <span>Telegram home channel</span>
            <input name="telegram_home_channel" defaultValue={hermes?.telegram_home_channel ?? ""} />
            <small className="field-hint">Optional Hermes home channel/chat ID.</small>
          </label>
        </div>

        <div className="settings-two-column">
          <label className="field">
            <span>Voice model</span>
            <input name="voice_model" defaultValue={chipmunk?.voice_model ?? DEFAULT_VOICE_MODEL} />
          </label>
          <label className="field">
            <span>xAI API key for voice and Hermes env</span>
            <input
              name="xai_api_key"
              type="password"
              autoComplete="off"
              placeholder={chipmunk?.xai_configured ? "saved, leave blank to keep" : "xai-..."}
            />
          </label>
        </div>
      </form>

      <section className="settings-fields-bordered stack">
        <div className="panel-header compact-header">
          <h3 className="settings-subheading">Provider auth</h3>
          <span className="settings-header-meta">{providerLabel(providers, hermes?.provider) ?? "No provider selected"}</span>
        </div>
        <ul className="settings-backend-list">
          {providers.map((provider) => (
            <ProviderRow
              apiOnline={apiOnline}
              busy={connectingProvider === provider.key}
              key={provider.key}
              provider={provider}
              onConnect={() => void connectProvider(provider)}
            />
          ))}
        </ul>
      </section>

      <section className="settings-fields-bordered stack">
        <h3 className="settings-subheading">Profile files</h3>
        <dl className="settings-kv-grid">
          <div>
            <dt>Profile</dt>
            <dd>{hermes?.profile_path ?? "missing"}</dd>
          </div>
          <div>
            <dt>Config</dt>
            <dd>{hermes?.config_path ?? "missing"}</dd>
          </div>
          <div>
            <dt>Env</dt>
            <dd>{hermes?.env_path ?? "missing"}</dd>
          </div>
          <div>
            <dt>Terminal cwd</dt>
            <dd>{hermes?.terminal_cwd || "not set"}</dd>
          </div>
        </dl>
      </section>

    </section>
  );
}

function StatusGrid({ hermes, xaiConfigured }: { hermes: ChipmunkHermesStatus | null; xaiConfigured: boolean }) {
  const cards = [
    ["Gateway", hermes?.gateway_running ? `running, pid ${hermes.gateway_pid ?? "unknown"}` : hermes?.gateway_state ?? "unknown", hermes?.gateway_running],
    ["Telegram", hermes?.telegram_token_configured ? "official Hermes token set" : "no Hermes token", hermes?.telegram_token_configured],
    ["OpenAI Codex", hermes?.openai_codex_configured ? "authenticated" : "not authenticated", hermes?.openai_codex_configured],
    ["xAI voice", xaiConfigured && hermes?.xai_api_key_synced ? "saved and synced" : xaiConfigured ? "saved, not synced" : "not saved", xaiConfigured && hermes?.xai_api_key_synced],
  ] as const;
  return (
    <div className="settings-status-grid">
      {cards.map(([label, value, ok]) => (
        <article className="settings-status-card" key={label}>
          <div className="settings-status-card-head">
            <strong>{label}</strong>
            <span className={`status-pill ${ok ? "status-pill-live" : "status-pill-offline"}`}>{ok ? "Ready" : "Check"}</span>
          </div>
          <p className="field-hint">{value}</p>
        </article>
      ))}
    </div>
  );
}

function ProviderRow({
  provider,
  apiOnline,
  busy,
  onConnect,
}: {
  provider: HermesProviderStatus;
  apiOnline: boolean;
  busy: boolean;
  onConnect: () => void;
}) {
  return (
    <li className="settings-backend-item">
      <div className="settings-backend-copy">
        <strong>{provider.label}</strong>
        <span className={provider.active ? "ok-text" : provider.configured ? "settings-note" : "warn-text"}>
          {provider.active ? "active" : provider.configured ? "configured" : provider.blocked_reason ?? "not configured"}
          {" · "}
          {provider.auth_kind}
          {" · "}
          {provider.model}
        </span>
        {!provider.configured && provider.manual_command ? <code className="settings-inline-code">{provider.manual_command}</code> : null}
      </div>
      <button className={provider.active ? "secondary" : "primary"} disabled={!apiOnline || busy} type="button" onClick={onConnect}>
        {busy ? "Connecting..." : provider.active ? "Refresh" : provider.connect_label}
      </button>
    </li>
  );
}

function providerOptions(providers: HermesProviderStatus[], active: string | undefined) {
  const options = providers.length ? providers : [{ key: DEFAULT_PROVIDER, label: "OpenAI Codex" } as HermesProviderStatus];
  if (!active || options.some((provider) => provider.key === active)) return options;
  return [{ key: active, label: active } as HermesProviderStatus, ...options];
}

function providerLabel(providers: HermesProviderStatus[], key: string | undefined) {
  return providers.find((provider) => provider.key === key)?.label ?? key;
}

function field(form: FormData, name: string) {
  return String(form.get(name) || "").trim();
}

function numberField(form: FormData, name: string) {
  const value = Number(field(form, name));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
