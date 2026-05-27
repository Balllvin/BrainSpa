import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { askChipmunk, buildTrainingAdapter, fetchBrainSpaOverview, generateDataset, runEval, runTrainingDryRun } from "@/lib/backend";
import type {
  BrainSpaOverview,
  ChipmunkChatResult,
  DatasetGenerateResult,
  EvalRunResult,
  TrainingAdapterBuildResult,
  TrainingDryRunResult,
} from "@/lib/types";

type RunState = {
  label: string;
  detail: string;
  path?: string;
};

export function HomePage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [chipmunk, setChipmunk] = useState<ChipmunkChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const result = await fetchBrainSpaOverview();
    setOnline(result.ok);
    setOverview(result.overview);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const personaModel = overview?.models.find((model) => model.key === "persona_small");
  const activeDataset = overview?.datasets.find((dataset) => dataset.state === "active") ?? overview?.datasets[0];
  const telegramReady = useMemo(
    () => Boolean(overview?.telegram_bots.some((bot) => bot.enabled && bot.allowed_chat_id_configured && bot.live_verified)),
    [overview],
  );
  const trainingModulesMissing = runState?.label === "training" && runState.detail.includes("Missing");

  async function runAction<T>(
    label: string,
    action: () => Promise<{ ok: boolean; data: T | null; error: string | null }>,
    describe: (data: T) => RunState,
  ) {
    setBusy(label);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Action failed.");
      return;
    }
    setRunState(describe(result.data));
    await refresh();
  }

  async function handleChipmunk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await askChipmunk(String(form.get("message") || ""));
    if (result.data) setChipmunk(result.data);
  }

  return (
    <div className="workbench">
      <section className="panel command-panel">
        <div className="command-kicker">Start here</div>
        <h1>Make a small model behave how you want.</h1>
        <form className="goal-box" onSubmit={handleChipmunk}>
          <input name="message" defaultValue="Believer: grounded, direct." />
          <button className="primary" type="submit">Ask Chipmunk</button>
        </form>
        <div className="btn-row">
          <button
            className="primary"
            type="button"
            onClick={() =>
              runAction<DatasetGenerateResult>("dataset", () => generateDataset(100), (data) => ({
                label: "dataset",
                detail: `${data.dataset.row_count} rows · ${data.warnings.length} warnings`,
                path: data.manifest_path,
              }))
            }
          >
            Generate data
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() =>
              runAction<TrainingDryRunResult>("training", runTrainingDryRun, (data) => ({
                label: "training",
                detail: data.missing_requirements.length
                  ? `Missing ${data.missing_requirements.join(", ")}`
                  : `${data.backend} ready`,
                path: data.output_dir,
              }))
            }
          >
            Dry-run train
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() =>
              runAction<TrainingAdapterBuildResult>("adapter", buildTrainingAdapter, (data) => ({
                label: "adapter",
                detail: data.loss === null ? `Missing ${data.missing_requirements.join(", ")}` : `loss ${data.loss.toFixed(3)} · ${data.rows_used} rows · ${data.steps} steps`,
                path: data.output_dir,
              }))
            }
          >
            Build adapter
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() =>
              runAction<EvalRunResult>(
                "eval",
                () => runEval("chat_believer", "Pray, read Scripture, ask God for grace, and take the next obedient step."),
                (data) => ({
                  label: "eval",
                  detail: `score ${data.score} · ${data.passed ? "passed" : "needs work"}`,
                  path: data.artifact_path,
                }),
              )
            }
          >
            Run eval
          </button>
        </div>
        {busy ? <div className="run-line">Running {busy}</div> : null}
        {error ? <div className="error">{error}</div> : null}
        {runState ? (
          <article className={`run-card ${trainingModulesMissing ? "run-card-warn" : ""}`}>
            <span>{runState.label}</span>
            <strong>{runState.detail}</strong>
            {runState.path ? <code>{runState.path}</code> : null}
          </article>
        ) : null}
        {chipmunk ? (
          <article className="run-card">
            <span>{chipmunk.routed_to}</span>
            <strong>{chipmunk.suggested_actions[0] ?? "Route ready"}</strong>
          </article>
        ) : null}
      </section>

      <aside className="panel status-panel">
        <StatusRow label="API" value={online === null ? "checking" : online ? "online" : "offline"} good={online === true} />
        <StatusRow label="Model" value={personaModel?.base_model ?? "pending"} good={Boolean(personaModel)} />
        <StatusRow label="Dataset" value={activeDataset ? `${activeDataset.state} · ${activeDataset.row_count} rows` : "none"} good={Boolean(activeDataset)} />
        <StatusRow label="Telegram" value={telegramReady ? "live" : "needs live token"} good={telegramReady} />
        <StatusRow label="Hardware" value={overview ? `${overview.hardware.memory_gb ?? "?"} GB · ${overview.hardware.machine}` : "pending"} good={Boolean(overview)} />
        <Link className="secondary full-button" to="/settings">Open settings</Link>
        <Link className="secondary full-button" to="/data">Open runs</Link>
        <Link className="secondary full-button" to="/chess">Open chess</Link>
      </aside>
    </div>
  );
}

function StatusRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong className={good ? "ok-text" : "warn-text"}>{value}</strong>
    </div>
  );
}
