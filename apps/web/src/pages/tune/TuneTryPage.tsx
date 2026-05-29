import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { fetchTuneModelStatus, testTrainingAdapter } from "@/lib/backend";
import { testScenarioPath } from "@/lib/testRoutes";
import { canonicalModelSlug, modelKeyFromSlug, tuneBuildPath, tuneModelPath } from "@/lib/tuneRoutes";
import type { AdapterTestResult, TuneModelStatus } from "@/lib/types";

import { formatMissingRequirements } from "./tuneDisplay";
import { TuneShell } from "./TuneShell";

const DEFAULT_PROMPT = "What should I do when fear starts steering my choices?";

export function TuneTryPage() {
  const { modelSlug = "" } = useParams();
  const canonicalSlug = canonicalModelSlug(modelSlug);
  const modelKey = modelKeyFromSlug(canonicalSlug);

  const [status, setStatus] = useState<TuneModelStatus | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [result, setResult] = useState<AdapterTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void fetchTuneModelStatus(canonicalSlug).then((response) => {
      if (response.status) setStatus(response.status);
      setReady(true);
    });
  }, [canonicalSlug]);

  if (modelSlug !== canonicalSlug) {
    return <Navigate replace to={`${tuneModelPath(canonicalSlug)}/try`} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const response = await testTrainingAdapter(text, modelKey);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Could not generate an answer.");
      setPrompt(text);
      return;
    }
    setResult(response.data);
    if (response.data.missing_requirements.length) {
      setError(formatMissingRequirements(response.data.missing_requirements));
    }
  }

  return (
    <TuneShell backTo={tuneModelPath(canonicalSlug)} backLabel={status?.display_name ?? "Model"} title="Quick try">
      {!ready ? <p className="tune-empty">Loading…</p> : null}
      {status?.adapter_state === "missing" ? (
        <p className="tune-stale-banner">
          No adapter yet. <Link to={tuneBuildPath(canonicalSlug)}>Build one first</Link>.
        </p>
      ) : null}

      <form className="tune-try-form" onSubmit={handleSubmit}>
        <label className="tune-field">
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            disabled={busy}
          />
        </label>
        <button className="tune-btn tune-btn--primary" type="submit" disabled={busy || !prompt.trim()}>
          {busy ? "Generating…" : "Send"}
        </button>
      </form>

      {error ? <p className="tune-error">{error}</p> : null}

      {result?.answer ? (
        <>
          <div className="tune-try-answer">
            <p>{result.answer}</p>
          </div>
          <div className="tune-next-links">
            <span className="tune-picker-meta--muted">Continue in Test:</span>
            <Link className="tune-btn" to={testScenarioPath(canonicalSlug, "witness")}>
              Witness
            </Link>
            <Link className="tune-btn" to={testScenarioPath(canonicalSlug, "counsel")}>
              Counsel
            </Link>
          </div>
        </>
      ) : null}
    </TuneShell>
  );
}
