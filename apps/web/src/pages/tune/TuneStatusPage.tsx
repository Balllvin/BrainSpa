import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { fetchTuneModelStatus, runAcceptanceCheck } from "@/lib/backend";
import { datasetDisplayLabel } from "@/lib/datasetsRoutes";
import { testModelPath } from "@/lib/testRoutes";
import { canonicalModelSlug, modelKeyFromSlug, tuneBuildPath, tuneModelPath } from "@/lib/tuneRoutes";
import type { AcceptanceRunResult, TuneModelStatus } from "@/lib/types";

import { adapterStatusLabel, formatBuiltAt, formatMissingRequirements } from "./tuneDisplay";
import { TuneShell } from "./TuneShell";
import { TuneStaleBanner } from "./TuneStaleBanner";

export function TuneStatusPage() {
  const { modelSlug = "" } = useParams();
  const canonicalSlug = canonicalModelSlug(modelSlug);
  const modelKey = modelKeyFromSlug(canonicalSlug);

  const [status, setStatus] = useState<TuneModelStatus | null>(null);
  const [acceptance, setAcceptance] = useState<AcceptanceRunResult | null>(null);
  const [showCases, setShowCases] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void fetchTuneModelStatus(canonicalSlug).then((response) => {
      if (!response.ok || !response.status) {
        setError(response.error ?? "Could not load status.");
      } else {
        setStatus(response.status);
      }
      setReady(true);
    });
  }, [canonicalSlug]);

  if (modelSlug !== canonicalSlug) {
    return <Navigate replace to={`${tuneModelPath(canonicalSlug)}/status`} />;
  }

  if (canonicalSlug === "snake") {
    return <Navigate replace to={tuneModelPath(canonicalSlug)} />;
  }

  async function handleAcceptance() {
    setBusy(true);
    setError(null);
    const response = await runAcceptanceCheck(modelKey);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Acceptance check failed.");
      return;
    }
    setAcceptance(response.data);
    void fetchTuneModelStatus(canonicalSlug).then((r) => {
      if (r.status) setStatus(r.status);
    });
  }

  const acceptanceSummary = status?.acceptance;
  const passed =
    acceptance?.passed ??
    (acceptanceSummary?.passed != null ? acceptanceSummary.passed : null);

  const datasetSlug = status?.dataset_key ?? "snake";
  const buildDatasetLabel = status?.build_dataset_key
    ? datasetDisplayLabel(status.build_dataset_key)
    : "—";

  return (
    <TuneShell backTo={tuneModelPath(canonicalSlug)} backLabel={status?.display_name ?? "Model"} title="Status">
      {!ready ? <p className="tune-empty">Loading…</p> : null}
      {error ? <p className="tune-error">{error}</p> : null}
      {status ? (
        <>
          {status.stale && status.stale_reason ? (
            <TuneStaleBanner message={status.stale_reason} datasetSlug={datasetSlug} />
          ) : null}

          <div className="tune-summary-card">
            <span className={`tune-status-badge tune-status-badge--${status.adapter_state}`}>
              {adapterStatusLabel(status.adapter_state)}
            </span>
            <p className="tune-summary-line">Built: {formatBuiltAt(status.built_at)}</p>
            <p className="tune-summary-line">
              Dataset used: {buildDatasetLabel}
              {status.build_rows_used != null ? ` (${status.build_rows_used} rows)` : ""}
            </p>
            <p className="tune-summary-line tune-summary-line--muted">
              Current training set: {status.dataset_row_count} rows
            </p>
            {status.missing_requirements.length ? (
              <p className="tune-result-line tune-result-line--warn">
                {formatMissingRequirements(status.missing_requirements)}
              </p>
            ) : null}
            {status.stale ? (
              <Link className="tune-btn" to={tuneBuildPath(canonicalSlug)}>
                Rebuild adapter
              </Link>
            ) : null}
          </div>

          <div className="tune-acceptance-card">
            <div className="tune-acceptance-head">
              <strong>
                Acceptance{" "}
                {passed === true ? (
                  <span className="tune-pass">Pass</span>
                ) : passed === false ? (
                  <span className="tune-needs-work">Needs work</span>
                ) : (
                  <span className="tune-picker-meta--muted">Not run</span>
                )}
              </strong>
              {acceptanceSummary && acceptanceSummary.cases_total > 0 && !acceptance ? (
                <span className="tune-picker-meta--muted">
                  {acceptanceSummary.cases_passed}/{acceptanceSummary.cases_total} cases
                </span>
              ) : null}
            </div>
            <button className="tune-btn" type="button" disabled={busy} onClick={handleAcceptance}>
              {busy ? "Running…" : "Run 10-question check"}
            </button>
            {acceptance ? (
              <>
                <p className="tune-result-line">
                  {acceptance.cases.filter((item) => item.passed).length}/{acceptance.cases.length} passed
                </p>
                <button
                  className="tune-details-toggle"
                  type="button"
                  onClick={() => setShowCases((value) => !value)}
                >
                  {showCases ? "Hide details" : "Show details"}
                </button>
                {showCases ? (
                  <ul className="tune-case-list">
                    {acceptance.cases.map((item, index) => (
                      <li key={`${index}-${item.prompt.slice(0, 24)}`} className={item.passed ? "" : "tune-case--fail"}>
                        <span className="tune-case-prompt">{item.prompt}</span>
                        <span className="tune-case-answer">{item.answer}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>

          {(status.adapter_state === "ready" || status.adapter_state === "stale") && (
            <Link className="tune-btn tune-btn--primary" to={testModelPath(canonicalSlug)}>
              Test {status.display_name}
            </Link>
          )}
        </>
      ) : null}
    </TuneShell>
  );
}
