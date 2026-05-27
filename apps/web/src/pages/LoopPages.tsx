import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  buildTrainingAdapter,
  fetchBrainSpaOverview,
  generateDataset,
  runEval,
  runTrainingDryRun,
  testTrainingAdapter,
} from "@/lib/backend";
import type {
  AdapterTestResult,
  BrainSpaOverview,
  DatasetGenerateResult,
  EvalRunResult,
  TrainingAdapterBuildResult,
  TrainingDryRunResult,
} from "@/lib/types";

export function EvidencePage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);

  useEffect(() => {
    void fetchBrainSpaOverview().then((result) => setOverview(result.overview));
  }, []);

  return (
    <LoopShell title="Evidence" operator="Source Model" note="Find proof of the behavior before generating rows.">
      <div className="loop-card-grid">
        {(overview?.sources ?? []).map((source) => (
          <article className="loop-card" key={source.key}>
            <span>{source.kind}</span>
            <strong>{source.label}</strong>
            <p>{source.summary}</p>
            <code>{source.provenance}</code>
          </article>
        ))}
      </div>
    </LoopShell>
  );
}

export function DatasetsPage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);
  const [result, setResult] = useState<DatasetGenerateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetchBrainSpaOverview();
    setOverview(response.overview);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function generateRows() {
    setBusy(true);
    setError(null);
    const response = await generateDataset(100);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Dataset generation failed.");
      return;
    }
    setResult(response.data);
    await refresh();
  }

  return (
    <LoopShell title="Datasets" operator="Data Model" note="Turn evidence into training rows and preference pairs.">
      <div className="loop-action-row">
        <button className="primary" type="button" onClick={generateRows} disabled={busy}>
          {busy ? "Generating" : "Generate rows"}
        </button>
        {error ? <span className="error">{error}</span> : null}
      </div>
      <div className="loop-card-grid">
        {(overview?.datasets ?? []).map((dataset) => (
          <article className="loop-card" key={dataset.key}>
            <span>{dataset.state}</span>
            <strong>{dataset.label}</strong>
            <p>{dataset.goal}</p>
            <code>{dataset.row_count} rows / {dataset.warnings.length} warnings</code>
          </article>
        ))}
      </div>
      {result ? <ResultCard title="Latest handoff" detail={`${result.dataset.row_count} rows`} path={result.manifest_path} /> : null}
    </LoopShell>
  );
}

export function TunePage() {
  const [dryRun, setDryRun] = useState<TrainingDryRunResult | null>(null);
  const [adapter, setAdapter] = useState<TrainingAdapterBuildResult | null>(null);
  const [adapterTest, setAdapterTest] = useState<AdapterTestResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDryRun() {
    setBusy("dry-run");
    setError(null);
    const response = await runTrainingDryRun();
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
    const response = await buildTrainingAdapter();
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Adapter build failed.");
      return;
    }
    setAdapter(response.data);
  }

  async function testAdapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("test");
    setError(null);
    const response = await testTrainingAdapter(String(form.get("prompt") || ""));
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Adapter test failed.");
      return;
    }
    setAdapterTest(response.data);
  }

  return (
    <LoopShell title="Tune" operator="Training Model" note="Dry-run first. Train only when the local runtime can do it.">
      <div className="loop-action-row">
        <button className="primary" type="button" onClick={runDryRun} disabled={Boolean(busy)}>Dry-run</button>
        <button className="secondary" type="button" onClick={buildAdapter} disabled={Boolean(busy)}>Build adapter</button>
        {error ? <span className="error">{error}</span> : null}
      </div>
      <form className="loop-form" onSubmit={testAdapter}>
        <label className="field">
          <span>Prompt</span>
          <input name="prompt" defaultValue="What should I do when fear starts steering my choices?" />
        </label>
        <button className="secondary" type="submit" disabled={Boolean(busy)}>Test adapter</button>
      </form>
      <div className="loop-card-grid">
        {dryRun ? <ResultCard title="Dry-run" detail={dryRun.missing_requirements.length ? `Missing ${dryRun.missing_requirements.join(", ")}` : `${dryRun.backend} ready`} path={dryRun.output_dir} /> : null}
        {adapter ? <ResultCard title="Adapter" detail={adapter.loss === null ? adapter.state : `loss ${adapter.loss.toFixed(3)}`} path={adapter.output_dir} /> : null}
        {adapterTest ? <ResultCard title="Adapter answer" detail={adapterTest.answer} path={adapterTest.adapter_path} /> : null}
      </div>
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
      setEnvironmentKey(response.overview?.environments[0]?.key ?? "chat_believer");
    });
  }, []);

  async function runHarness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const response = await runEval(environmentKey, String(form.get("answer") || ""), undefined, String(form.get("prompt") || ""));
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Harness check failed.");
      return;
    }
    setResult(response.data);
  }

  return (
    <LoopShell title="Test" operator="Harness Model" note="Design the world, tools, allowed moves, and scoring.">
      <form className="loop-form" onSubmit={runHarness}>
        <label className="field">
          <span>Environment</span>
          <select value={environmentKey} onChange={(event) => setEnvironmentKey(event.target.value)}>
            {(overview?.environments ?? []).map((environment) => (
              <option key={environment.key} value={environment.key}>{environment.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Prompt</span>
          <input name="prompt" defaultValue="User asks for the next concrete step." />
        </label>
        <label className="field">
          <span>Answer</span>
          <textarea name="answer" rows={4} defaultValue="Pray, read Scripture, ask God for grace, and take the next obedient step." />
        </label>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Running" : "Run harness"}</button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {result ? <ResultCard title={result.passed ? "Passed" : "Needs work"} detail={`score ${result.score}`} path={result.artifact_path} /> : null}
      <div className="loop-card-grid">
        {(overview?.environments ?? []).map((environment) => (
          <article className="loop-card" key={environment.key}>
            <span>{environment.key}</span>
            <strong>{environment.label}</strong>
            <p>{environment.goal}</p>
            <code>{environment.scoring.slice(0, 3).join(" / ")}</code>
          </article>
        ))}
      </div>
    </LoopShell>
  );
}

function LoopShell({ children, note, operator, title }: { children: ReactNode; note: string; operator: string; title: string }) {
  return (
    <div className="loop-page">
      <header className="loop-page-header">
        <span>{operator}</span>
        <h1>{title}</h1>
        <p>{note}</p>
      </header>
      {children}
    </div>
  );
}

function ResultCard({ detail, path, title }: { detail: string; path?: string; title: string }) {
  return (
    <article className="loop-card loop-card-result">
      <span>Result</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {path ? <code>{path}</code> : null}
    </article>
  );
}
