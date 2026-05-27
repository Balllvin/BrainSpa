import { FormEvent, useEffect, useState } from "react";

import { buildTrainingAdapter, fetchBrainSpaOverview, generateDataset, runEval, runTrainingDryRun, testTrainingAdapter } from "@/lib/backend";
import type { AdapterTestResult, BrainSpaOverview, DatasetGenerateResult, EvalRunResult, TrainingAdapterBuildResult, TrainingDryRunResult } from "@/lib/types";

export function ForgePage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [datasetResult, setDatasetResult] = useState<DatasetGenerateResult | null>(null);
  const [trainingResult, setTrainingResult] = useState<TrainingDryRunResult | null>(null);
  const [adapterResult, setAdapterResult] = useState<TrainingAdapterBuildResult | null>(null);
  const [adapterTest, setAdapterTest] = useState<AdapterTestResult | null>(null);
  const [evalResult, setEvalResult] = useState<EvalRunResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshOverview() {
    const result = await fetchBrainSpaOverview();
    setOnline(result.ok);
    setOverview(result.overview);
  }

  useEffect(() => {
    let cancelled = false;
    fetchBrainSpaOverview().then((result) => {
      if (cancelled) return;
      setOnline(result.ok);
      setOverview(result.overview);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction<T>(label: string, action: () => Promise<{ ok: boolean; data: T | null; error: string | null }>, save: (value: T) => void) {
    setBusy(label);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok || !result.data) {
      setError(result.error);
      return;
    }
    save(result.data);
    await refreshOverview();
  }

  async function handleBelieverEval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const prompt = String(form.get("prompt") || "");
    const answer = String(form.get("answer") || "");
    await runAction(
      "believer eval",
      () => runEval("chat_believer", answer, undefined, prompt),
      setEvalResult,
    );
  }

  async function handleAdapterTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const prompt = String(form.get("adapterPrompt") || "");
    await runAction("adapter test", () => testTrainingAdapter(prompt), setAdapterTest);
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <h1>Data</h1>
          <span className={`status-pill ${online ? "status-pill-live" : "status-pill-offline"}`}>
            {online === null ? "checking api" : online ? "api connected" : "api offline"}
          </span>
        </div>
        <div className="btn-row">
          <button className="primary" type="button" onClick={() => runAction("dataset", () => generateDataset(100), setDatasetResult)}>
            Generate dataset
          </button>
          <button className="secondary" type="button" onClick={() => runAction("training", runTrainingDryRun, setTrainingResult)}>
            Training dry-run
          </button>
          <button className="secondary" type="button" onClick={() => runAction("adapter", buildTrainingAdapter, setAdapterResult)}>
            Build adapter
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() =>
              runAction(
                "eval",
                () =>
                  runEval(
                    "chat_believer",
                    "Pray, read Scripture, ask God for grace, and take the next obedient step.",
                  ),
                setEvalResult,
              )
            }
          >
            Run eval
          </button>
        </div>
        {busy ? <p className="muted">Running {busy}…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="row-group" style={{ marginTop: 14 }}>
          {(overview?.datasets ?? []).map((dataset) => (
            <article className="data-row" key={dataset.key}>
              <div>
                <span className="status-pill status-pill-live">{dataset.state}</span>
                <h3>{dataset.label}</h3>
                <p>{dataset.row_count} rows</p>
              </div>
              <dl className="meta-dl">
                <div>
                  <dt>Checks</dt>
                  <dd>{dataset.quality_notes.length}</dd>
                </div>
                <div>
                  <dt>Warnings</dt>
                  <dd>{dataset.warnings.length}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
      <section className="panel stack">
        <div className="panel-header">
          <h2>Believer harness</h2>
          <span className="tag">test answer</span>
        </div>
        <form className="stack" onSubmit={handleBelieverEval}>
          <label className="field">
            <span>Prompt</span>
            <input name="prompt" defaultValue="What should I do when I feel spiritually weak?" />
          </label>
          <label className="field">
            <span>Answer</span>
            <textarea
              name="answer"
              rows={5}
              defaultValue="Pray, read Scripture, ask God for grace, and take the next obedient step."
            />
          </label>
          <div className="btn-row">
            <button className="primary" type="submit">Test answer</button>
          </div>
        </form>
        <form className="stack" onSubmit={handleAdapterTest}>
          <label className="field">
            <span>Adapter prompt</span>
            <input name="adapterPrompt" defaultValue="What should I do when fear starts steering my choices?" />
          </label>
          <div className="btn-row">
            <button className="secondary" type="submit">Test adapter</button>
          </div>
        </form>
        {datasetResult ? (
          <article className="data-row" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <h3>Dataset handoff</h3>
              <p>{datasetResult.dataset.row_count} rows · {datasetResult.dataset.state}</p>
              <code className="code-path">{datasetResult.manifest_path}</code>
            </div>
          </article>
        ) : null}
        {trainingResult ? (
          <article className="data-row" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <h3>Training dry-run</h3>
              <p>{trainingResult.backend} · {trainingResult.state}</p>
              <code className="code-path">{trainingResult.output_dir}</code>
            </div>
            {trainingResult.missing_requirements.length > 0 ? (
              <p className="error">Missing: {trainingResult.missing_requirements.join(", ")}</p>
            ) : null}
          </article>
        ) : null}
        {adapterResult ? (
          <article className="data-row" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <h3>Adapter build</h3>
              <p>{adapterResult.loss === null ? adapterResult.state : `loss ${adapterResult.loss.toFixed(3)} · ${adapterResult.rows_used} rows · ${adapterResult.steps} steps`}</p>
              <code className="code-path">{adapterResult.output_dir}</code>
            </div>
            {adapterResult.missing_requirements.length > 0 ? (
              <p className="error">Missing: {adapterResult.missing_requirements.join(", ")}</p>
            ) : null}
          </article>
        ) : null}
        {evalResult ? (
          <article className="data-row" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <h3>Eval comments</h3>
              <p>Score {evalResult.score} · {evalResult.passed ? "passed" : "needs work"}</p>
            </div>
            <dl className="meta-dl">
              {evalResult.comments.map((comment) => (
                <div key={comment.dimension}>
                  <dt>{comment.dimension}</dt>
                  <dd>{comment.verdict}</dd>
                </div>
              ))}
            </dl>
          </article>
        ) : null}
        {adapterTest ? (
          <article className="data-row" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <h3>Adapter answer</h3>
              <p>{adapterTest.answer}</p>
              <code className="code-path">{adapterTest.adapter_path}</code>
            </div>
            {adapterTest.eval ? (
              <dl className="meta-dl">
                <div>
                  <dt>Score</dt>
                  <dd>{adapterTest.eval.score}</dd>
                </div>
                <div>
                  <dt>State</dt>
                  <dd>{adapterTest.eval.passed ? "passed" : "needs work"}</dd>
                </div>
              </dl>
            ) : null}
            {adapterTest.missing_requirements.length > 0 ? (
              <p className="error">Missing: {adapterTest.missing_requirements.join(", ")}</p>
            ) : null}
          </article>
        ) : null}
        {!datasetResult && !trainingResult && !adapterResult && !adapterTest && !evalResult ? <p className="muted">No run in this browser session yet.</p> : null}
      </section>
    </div>
  );
}
