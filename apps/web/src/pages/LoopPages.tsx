import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  buildTrainingAdapter,
  fetchBrainSpaOverview,
  generateDataset,
  runEval,
  runTrainingDryRun,
  testTrainingAdapter,
} from "@/lib/backend";
import { useAppSettings } from "@/hooks/useAppSettings";
import type {
  AdapterTestResult,
  BrainSpaOverview,
  DatasetGenerateResult,
  EvalRunResult,
  ModelProfile,
  TrainingAdapterBuildResult,
  TrainingDryRunResult,
} from "@/lib/types";

function LoopShell({
  title,
  stageKey,
  note,
  children,
}: {
  title: string;
  stageKey: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel stack loop-page">
      <header className="panel-header compact-header">
        <h2>{title}</h2>
        <Link className="secondary" to="/settings/agents">
          Hermes agent
        </Link>
      </header>
      <p className="field-hint">{note}</p>
      <p className="field-hint">
        Stage <code>{stageKey}</code> — CLI and Telegram are configured in{" "}
        <Link to="/settings/agents">Settings → Hermes agents</Link>.
      </p>
      {children}
    </section>
  );
}

export function EvidencePage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);

  useEffect(() => {
    void fetchBrainSpaOverview().then((r) => setOverview(r.overview));
  }, []);

  return (
    <LoopShell
      title="Evidence"
      stageKey="evidence"
      note="Source material and proof before dataset rows. Hermes Evidence agent runs on the CLI you assigned."
    >
      <ul className="settings-registry-list">
        {(overview?.sources ?? []).map((source) => (
          <li key={source.key}>
            <strong>{source.label}</strong> — {source.kind}: {source.summary}
          </li>
        ))}
      </ul>
      {!overview?.sources?.length ? <p className="settings-empty-row">No sources registered in state yet.</p> : null}
    </LoopShell>
  );
}

export function DatasetsPage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);
  const [result, setResult] = useState<DatasetGenerateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBrainSpaOverview().then((r) => setOverview(r.overview));
  }, []);

  async function generateRows() {
    setBusy(true);
    setError(null);
    const response = await generateDataset(24);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Generation failed.");
      return;
    }
    setResult(response.data);
    const refreshed = await fetchBrainSpaOverview();
    setOverview(refreshed.overview);
  }

  return (
    <LoopShell
      title="Datasets"
      stageKey="datasets"
      note="Turn evidence into training rows. Generation writes local JSONL under ~/.brain-spa/artifacts."
    >
      <button className="primary" disabled={busy} type="button" onClick={generateRows}>
        {busy ? "Generating…" : "Generate sample rows (24)"}
      </button>
      {error ? <p className="error">{error}</p> : null}
      <ul className="settings-registry-list">
        {(overview?.datasets ?? []).map((d) => (
          <li key={d.key}>
            {d.label} — {d.state}, {d.row_count} rows
          </li>
        ))}
      </ul>
      {result ? <p className="settings-note">Wrote {result.dataset.row_count} rows → {result.manifest_path}</p> : null}
    </LoopShell>
  );
}

export function TunePage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);
  const [modelKey, setModelKey] = useState("persona_small");
  const [datasetKey, setDatasetKey] = useState("believer_seed");
  const [dryRun, setDryRun] = useState<TrainingDryRunResult | null>(null);
  const [adapter, setAdapter] = useState<TrainingAdapterBuildResult | null>(null);
  const [adapterTest, setAdapterTest] = useState<AdapterTestResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBrainSpaOverview().then((r) => {
      setOverview(r.overview);
      const nextModels = r.overview?.models ?? [];
      if (nextModels.length) {
        setModelKey((current) => (nextModels.some((m) => m.key === current) ? current : nextModels[0].key));
      }
      const nextDatasets = r.overview?.datasets ?? [];
      if (nextDatasets.length) {
        setDatasetKey((current) =>
          nextDatasets.some((d) => d.key === current) ? current : nextDatasets[0].key,
        );
      }
    });
  }, []);

  const models: ModelProfile[] = overview?.models ?? [];
  const datasets = overview?.datasets ?? [];

  async function runDryRun() {
    setBusy("dry-run");
    setError(null);
    const response = await runTrainingDryRun(modelKey, datasetKey);
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Dry-run failed.");
      return;
    }
    setDryRun(response.data);
  }

  async function buildAdapter() {
    setBusy("adapter");
    setError(null);
    const response = await buildTrainingAdapter(modelKey, datasetKey);
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Build failed.");
      return;
    }
    setAdapter(response.data);
  }

  async function testAdapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("test");
    setError(null);
    const response = await testTrainingAdapter(String(form.get("prompt") || ""), modelKey);
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Test failed.");
      return;
    }
    setAdapterTest(response.data);
  }

  return (
    <LoopShell
      title="Tune"
      stageKey="tune"
      note="Pick a registry model and dataset. Dry-run is fast; build adapter downloads weights and can take several minutes."
    >
      <div className="loop-form">
        <label className="field">
          <span>Model</span>
          <select value={modelKey} onChange={(e) => setModelKey(e.target.value)} disabled={!models.length}>
            {models.length === 0 ? <option value="">Loading models…</option> : null}
            {models.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({m.state}) — {m.base_model}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dataset</span>
          <select value={datasetKey} onChange={(e) => setDatasetKey(e.target.value)}>
            {datasets.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label} ({d.state})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="loop-action-row">
        <button className="primary" disabled={Boolean(busy)} type="button" onClick={runDryRun}>
          Dry-run
        </button>
        <button className="secondary" disabled={Boolean(busy)} type="button" onClick={buildAdapter}>
          Build adapter (slow)
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <form className="loop-form" onSubmit={testAdapter}>
        <label className="field">
          <span>Prompt</span>
          <input name="prompt" defaultValue="What should I do when fear starts steering my choices?" />
        </label>
        <button className="secondary" disabled={Boolean(busy)} type="submit">
          Test adapter (slow)
        </button>
      </form>
      {dryRun ? (
        <p className="settings-note">
          Dry-run: {dryRun.backend} — {dryRun.missing_requirements.length ? dryRun.missing_requirements.join(", ") : "ready"}
        </p>
      ) : null}
      {adapter ? <p className="settings-note">Adapter: {adapter.state} → {adapter.output_dir}</p> : null}
      {adapterTest ? <p className="settings-note">Answer: {adapterTest.answer}</p> : null}
    </LoopShell>
  );
}

export function TestPage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);
  const [environmentKey, setEnvironmentKey] = useState("chat_believer");
  const [result, setResult] = useState<EvalRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBrainSpaOverview().then((response) => {
      setOverview(response.overview);
      const first = response.overview?.environments[0]?.key ?? "chat_believer";
      setEnvironmentKey(first);
    });
  }, []);

  const isChess = environmentKey === "chess";
  const env = overview?.environments.find((e) => e.key === environmentKey);

  async function runHarness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const response = await runEval(
      environmentKey,
      String(form.get("answer") || ""),
      isChess ? String(form.get("fen") || "") : undefined,
      String(form.get("prompt") || ""),
    );
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Harness check failed.");
      return;
    }
    setResult(response.data);
  }

  return (
    <LoopShell
      title="Test"
      stageKey="test"
      note="Harness scoring is heuristic (not Stockfish). Believer chat checks conviction; chess checks FEN legality."
    >
      <form className="loop-form" onSubmit={runHarness}>
        <label className="field">
          <span>Harness</span>
          <select value={environmentKey} onChange={(e) => setEnvironmentKey(e.target.value)}>
            {(overview?.environments ?? []).map((environment) => (
              <option key={environment.key} value={environment.key}>
                {environment.label}
              </option>
            ))}
          </select>
          {env ? <small className="field-hint">{env.harness} — scores: {env.scoring.join(", ")}</small> : null}
        </label>
        <label className="field">
          <span>Prompt</span>
          <input name="prompt" defaultValue="What should I do when I feel spiritually weak?" />
        </label>
        {isChess ? (
          <label className="field">
            <span>FEN (optional)</span>
            <input
              name="fen"
              placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            />
          </label>
        ) : null}
        <label className="field">
          <span>Model answer</span>
          <textarea name="answer" rows={4} defaultValue="Pray, read Scripture, and ask your church for help." />
        </label>
        <button className="primary" disabled={busy} type="submit">
          {busy ? "Scoring…" : "Run harness"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {result ? (
        <div className="settings-status-card">
          <strong>
            Score {Math.round(result.score * 100)}% — {result.passed ? "pass" : "fail"}
          </strong>
          <ul className="settings-registry-list">
            {result.comments.map((c) => (
              <li key={c.dimension}>
                {c.dimension}: {c.verdict} — {c.comment}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </LoopShell>
  );
}
