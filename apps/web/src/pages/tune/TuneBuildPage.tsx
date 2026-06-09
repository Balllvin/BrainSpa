import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import {
  fetchBrainSpaOverview,
  fetchTuneBuildPreview,
  fetchTuneModelStatus,
  runTrainingDryRun,
  startTuneBuild,
} from "@/lib/backend";
import { testScenarioPath } from "@/lib/testRoutes";
import {
  canonicalModelSlug,
  modelKeyFromSlug,
  tuneModelPath,
  tuneStatusPath,
} from "@/lib/tuneRoutes";
import type {
  DatasetProfile,
  TrainingAdapterBuildResult,
  TrainingDryRunResult,
  TrainingPreset,
  TuneBuildPreview,
  TuneModelStatus,
} from "@/lib/types";

import { TunePreBuildSummary } from "./TunePreBuildSummary";
import { TuneStaleBanner } from "./TuneStaleBanner";
import { TuneShell } from "./TuneShell";
import {
  TRAINING_PRESETS,
  buildPhaseLabel,
  formatDatasetOptionLabel,
  formatMissingRequirements,
  presetLabel,
} from "./tuneDisplay";
import { useTuneBuildJob } from "./useTuneBuildJob";

type WizardStep = "pick" | "dry-run" | "build" | "done";

export function TuneBuildPage() {
  const { modelSlug = "" } = useParams();
  const canonicalSlug = canonicalModelSlug(modelSlug);
  const modelKey = modelKeyFromSlug(canonicalSlug);

  const [status, setStatus] = useState<TuneModelStatus | null>(null);
  const [datasets, setDatasets] = useState<DatasetProfile[]>([]);
  const [preview, setPreview] = useState<TuneBuildPreview | null>(null);
  const [datasetKey, setDatasetKey] = useState("snake_rollout");
  const [preset, setPreset] = useState<TrainingPreset>("standard");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("pick");
  const [dryRun, setDryRun] = useState<TrainingDryRunResult | null>(null);
  const [build, setBuild] = useState<TrainingAdapterBuildResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const buildJob = useTuneBuildJob(canonicalSlug, building);

  useEffect(() => {
    void Promise.all([fetchTuneModelStatus(canonicalSlug), fetchBrainSpaOverview()]).then(
      ([tuneResponse, overviewResponse]) => {
        if (tuneResponse.status) {
          setStatus(tuneResponse.status);
          if (tuneResponse.status.dataset_key) {
            setDatasetKey(tuneResponse.status.dataset_key);
          }
        }
        const nextDatasets = overviewResponse.overview?.datasets ?? [];
        setDatasets(nextDatasets);
        if (nextDatasets.length) {
          setDatasetKey((current) =>
            nextDatasets.some((item) => item.key === current) ? current : nextDatasets[0].key,
          );
        }
        setReady(true);
      },
    );
  }, [canonicalSlug]);

  useEffect(() => {
    if (!ready) return;
    void fetchTuneBuildPreview(canonicalSlug, datasetKey).then((response) => {
      if (response.preview) setPreview(response.preview);
    });
  }, [ready, canonicalSlug, datasetKey]);

  useEffect(() => {
    if (!buildJob || !building) return;
    if (buildJob.state === "running") return;
    setBuilding(false);
    if (buildJob.result) {
      setBuild(buildJob.result);
      setStep(buildJob.result.state === "complete" ? "done" : "build");
      if (buildJob.result.missing_requirements.length) {
        setError(formatMissingRequirements(buildJob.result.missing_requirements));
      }
    } else if (buildJob.error) {
      setError(buildJob.error);
    }
    void fetchTuneModelStatus(canonicalSlug).then((r) => {
      if (r.status) setStatus(r.status);
    });
    void fetchTuneBuildPreview(canonicalSlug, datasetKey).then((r) => {
      if (r.preview) setPreview(r.preview);
    });
  }, [buildJob, building, canonicalSlug, datasetKey]);

  if (modelSlug !== canonicalSlug) {
    return <Navigate replace to={`${tuneModelPath(canonicalSlug)}/build`} />;
  }

  async function handleDryRun() {
    setBusy("dry-run");
    setError(null);
    const response = await runTrainingDryRun(modelKey, datasetKey);
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Dry-run failed.");
      return;
    }
    setDryRun(response.data);
    setStep("dry-run");
    if (response.data.missing_requirements.length) {
      setError(formatMissingRequirements(response.data.missing_requirements));
    }
  }

  async function handleBuild() {
    if (building || busy) return;
    setBuilding(true);
    setBusy("build");
    setError(null);
    setBuild(null);
    const response = await startTuneBuild(modelKey, datasetKey, preset);
    setBusy(null);
    if (!response.ok || !response.data) {
      setBuilding(false);
      setError(response.error ?? "Could not start build.");
      return;
    }
    if (response.data.state !== "running") {
      setBuilding(false);
      if (response.data.result) {
        setBuild(response.data.result);
        setStep(response.data.result.state === "complete" ? "done" : "build");
      }
      if (response.data.error) {
        setError(response.data.error);
      }
    }
  }

  const dryRunReady = dryRun && !dryRun.missing_requirements.length;
  const canBuild = dryRunReady && !busy && !building;
  const datasetSlug = preview?.dataset_slug ?? "snake";

  return (
    <TuneShell backTo={tuneModelPath(canonicalSlug)} backLabel={status?.display_name ?? "Model"} title="Build">
      {!ready ? <p className="tune-empty">Loading…</p> : null}
      {preview?.stale && preview.stale_reason ? (
        <TuneStaleBanner message={preview.stale_reason} datasetSlug={datasetSlug} />
      ) : null}

      {preview ? <TunePreBuildSummary preview={preview} /> : null}

      <ol className="tune-wizard-steps">
        <li className={step === "pick" ? "tune-wizard-step--active" : dryRun ? "tune-wizard-step--done" : ""}>
          Dataset
        </li>
        <li className={step === "dry-run" ? "tune-wizard-step--active" : build ? "tune-wizard-step--done" : ""}>
          Dry-run
        </li>
        <li className={step === "build" || step === "done" ? "tune-wizard-step--active" : ""}>Build</li>
      </ol>

      <div className="tune-form">
        <label className="tune-field">
          <span>Training dataset</span>
          <select
            value={datasetKey}
            onChange={(event) => {
              setDatasetKey(event.target.value);
              setDryRun(null);
              setBuild(null);
              setStep("pick");
              setError(null);
            }}
            disabled={Boolean(busy) || building}
          >
            {datasets.map((dataset) => (
              <option key={dataset.key} value={dataset.key}>
                {formatDatasetOptionLabel(dataset)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details
        className="tune-advanced"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary>Advanced</summary>
        <fieldset className="tune-preset-row" disabled={Boolean(busy) || building}>
          <legend>Training intensity</legend>
          {TRAINING_PRESETS.map((item) => (
            <label key={item.id} className="tune-preset-option">
              <input
                type="radio"
                name="training-preset"
                value={item.id}
                checked={preset === item.id}
                onChange={() => {
                  setPreset(item.id);
                  setDryRun(null);
                  setBuild(null);
                  setStep("pick");
                }}
              />
              <span>
                <strong>{item.label}</strong>
                <span className="tune-action-hint">{item.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </details>

      <div className="tune-action-row">
        <button
          className="tune-btn tune-btn--primary"
          type="button"
          disabled={Boolean(busy) || building}
          onClick={handleDryRun}
        >
          {busy === "dry-run" ? "Checking…" : "Dry-run"}
        </button>
        <button
          className="tune-btn"
          type="button"
          disabled={!canBuild}
          onClick={handleBuild}
          title={dryRunReady ? undefined : "Run dry-run first"}
        >
          {building ? "Building…" : "Build"}
        </button>
      </div>

      {building ? (
        <p className="tune-build-progress" role="status">
          {buildPhaseLabel(buildJob)}
          {buildJob?.training_preset ? ` · ${presetLabel(buildJob.training_preset)}` : ""}
        </p>
      ) : null}

      {error ? <p className="tune-error">{error}</p> : null}

      {dryRun ? (
        <div className="tune-result-card">
          <strong>Dry-run</strong>
          <p className="tune-result-line">
            {dryRun.missing_requirements.length ? "Blocked" : "Ready to build"}
          </p>
          {dryRun.missing_requirements.length ? (
            <p className="tune-result-line tune-result-line--warn">
              {formatMissingRequirements(dryRun.missing_requirements)}
            </p>
          ) : (
            <p className="tune-result-line tune-result-line--muted">No weights changed.</p>
          )}
        </div>
      ) : null}

      {build ? (
        <div className="tune-result-card">
          <strong>{build.state === "complete" ? "Build complete" : "Build blocked"}</strong>
          {build.state === "complete" ? (
            <>
              <p className="tune-result-line">
                {build.rows_used} rows · {build.steps} steps · {presetLabel(build.training_preset ?? preset)}
                {build.loss != null ? ` · loss ${build.loss.toFixed(4)}` : ""}
              </p>
              <div className="tune-next-links">
                <Link className="tune-btn tune-btn--primary" to={testScenarioPath(canonicalSlug, "autonomous-watch")}>
                  Watch policy
                </Link>
                <Link className="tune-btn" to={testScenarioPath(canonicalSlug, "autonomous-train")}>
                  Train more
                </Link>
                <Link className="tune-btn" to={tuneStatusPath(canonicalSlug)}>
                  View status
                </Link>
              </div>
            </>
          ) : (
            <p className="tune-result-line tune-result-line--warn">
              {formatMissingRequirements(build.missing_requirements)}
            </p>
          )}
        </div>
      ) : null}
    </TuneShell>
  );
}
