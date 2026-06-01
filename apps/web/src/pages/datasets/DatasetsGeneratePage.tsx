import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  fetchDatasetEvidenceGate,
  fetchDatasetScenarios,
  generateDatasetForKey,
} from "@/lib/backend";
import {
  datasetDisplayLabel,
  datasetKeyFromSlug,
  datasetRowsPath,
  datasetsHomePath,
} from "@/lib/datasetsRoutes";
import type { DatasetEvidenceGate, DatasetGenerateResult, DatasetRow, TestScenario } from "@/lib/types";

import { DatasetsShell } from "./DatasetsShell";

const DEFAULT_SCENARIOS = ["counsel", "advice", "daily-word", "review"];

export function DatasetsGeneratePage() {
  const { datasetSlug = "starter" } = useParams();
  const datasetKey = datasetKeyFromSlug(datasetSlug);
  const label = datasetDisplayLabel(datasetKey);

  const [gate, setGate] = useState<DatasetEvidenceGate | null>(null);
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [rowCount, setRowCount] = useState(24);
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(new Set(DEFAULT_SCENARIOS));
  const [mixEven, setMixEven] = useState(true);
  const [weights, setWeights] = useState<Record<string, number>>({
    counsel: 1,
    advice: 1,
    review: 1,
    "daily-word": 1,
  });
  const [groundInEvidence, setGroundInEvidence] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DatasetGenerateResult | null>(null);
  const [result, setResult] = useState<DatasetGenerateResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    void fetchDatasetEvidenceGate().then((response) => {
      if (response.gate) setGate(response.gate);
    });
    void fetchDatasetScenarios().then((response) => {
      if (response.scenarios.length) {
        setScenarios(response.scenarios);
        setSelectedScenarios(new Set(response.scenarios.map((s) => s.key)));
      }
    });
  }, []);

  const scenarioList = useMemo(
    () => (scenarios.length ? scenarios : DEFAULT_SCENARIOS.map((key) => ({ key, label: key.toUpperCase(), mode: "chat", placeholder: "", hint: "" }))),
    [scenarios],
  );

  const activeScenarios = useMemo(
    () => [...selectedScenarios].filter((key) => scenarioList.some((s) => s.key === key)),
    [selectedScenarios, scenarioList],
  );

  const canRun = activeScenarios.length > 0 && (groundInEvidence ? gate?.ready : true);

  function toggleScenario(key: string) {
    setSelectedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function buildOptions(previewOnly: boolean, pack: string | null = null) {
    const scenario_weights: Record<string, number> = {};
    if (!mixEven) {
      for (const key of activeScenarios) {
        scenario_weights[key] = Math.max(0, weights[key] ?? 0);
      }
    }
    return {
      example_count: rowCount,
      scenarios: activeScenarios,
      scenario_weights,
      mix_even: mixEven,
      ground_in_evidence: groundInEvidence,
      preview_only: previewOnly,
      pack,
    };
  }

  async function runPreview() {
    setBusy("preview");
    setError(null);
    const response = await generateDatasetForKey(datasetKey, buildOptions(true));
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Preview failed.");
      return;
    }
    setPreview(response.data);
  }

  async function runGenerate(pack: string | null = null) {
    setBusy(pack ? `pack-${pack}` : "generate");
    setError(null);
    setPreview(null);
    const response = await generateDatasetForKey(datasetKey, buildOptions(false, pack));
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Generation failed.");
      return;
    }
    setResult(response.data);
    if (response.data.evidence_gate) setGate(response.data.evidence_gate);
  }

  const warningCount = result?.warnings.length ?? 0;
  const rowTotal = result?.dataset.row_count ?? 0;
  const mix = result?.scenario_mix ?? preview?.scenario_mix ?? {};

  return (
    <DatasetsShell backTo={datasetsHomePath()} title={`Generate · ${label}`}>
      <div className="datasets-generate-panel">
        <label className="datasets-field">
          <span>Row count ({rowCount})</span>
          <input
            type="range"
            min={4}
            max={96}
            step={4}
            value={rowCount}
            onChange={(e) => setRowCount(Number(e.target.value))}
          />
        </label>

        <fieldset className="datasets-fieldset">
          <legend>Test scenarios</legend>
          <div className="datasets-scenario-checks">
            {scenarioList.map((scenario) => (
              <label key={scenario.key} className="datasets-check">
                <input
                  checked={selectedScenarios.has(scenario.key)}
                  type="checkbox"
                  onChange={() => toggleScenario(scenario.key)}
                />
                <span>{scenario.label}</span>
                <span className="datasets-check-hint">{scenario.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="datasets-check datasets-check--inline">
          <input checked={mixEven} type="checkbox" onChange={(e) => setMixEven(e.target.checked)} />
          <span>Mix evenly across selected scenarios</span>
        </label>

        {!mixEven ? (
          <div className="datasets-weights">
            {activeScenarios.map((key) => {
              const scenario = scenarioList.find((s) => s.key === key);
              return (
                <label key={key} className="datasets-field datasets-field--compact">
                  <span>{scenario?.label ?? key} weight</span>
                  <input
                    min={0}
                    max={48}
                    type="number"
                    value={weights[key] ?? 1}
                    onChange={(e) =>
                      setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))
                    }
                  />
                </label>
              );
            })}
          </div>
        ) : null}

        <label className="datasets-check datasets-check--inline">
          <input
            checked={groundInEvidence}
            type="checkbox"
            onChange={(e) => setGroundInEvidence(e.target.checked)}
          />
          <span>Ground in approved evidence</span>
        </label>

        {groundInEvidence && gate && !gate.ready ? (
          <div className="datasets-callout datasets-callout--warn">
            <p>{gate.message}</p>
            <Link className="datasets-inline-link" to="/evidence">
              Needs approved evidence
            </Link>
          </div>
        ) : null}

        {groundInEvidence && gate?.ready ? (
          <p className="datasets-hint">
            {gate.approved_count} approved claim(s) will be paraphrased into rows (not copied verbatim).
          </p>
        ) : null}

        {!groundInEvidence ? (
          <p className="datasets-callout datasets-callout--warn">
            Template fallback — rows will not use approved claims. Turn grounding on for evidence-backed
            training text.
          </p>
        ) : null}

        <div className="datasets-generate-actions">
          <button
            className="secondary"
            disabled={Boolean(busy) || !canRun}
            type="button"
            onClick={runPreview}
          >
            {busy === "preview" ? "Previewing…" : "Preview 2 samples"}
          </button>
          <button
            className="primary"
            disabled={Boolean(busy) || !canRun}
            type="button"
            onClick={() => runGenerate()}
          >
            {busy === "generate" ? "Generating…" : `Generate ${rowCount} rows`}
          </button>
        </div>

        <div className="datasets-pack-row">
          <span className="datasets-pack-label">Quick packs</span>
          <button
            className="secondary"
            disabled={Boolean(busy) || !canRun}
            type="button"
            onClick={() => runGenerate("review-heavy")}
          >
            12 review-heavy
          </button>
          <button
            className="secondary"
            disabled={Boolean(busy)}
            type="button"
            onClick={() => runGenerate("import-feedback-only")}
          >
            Import feedback only
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {preview?.preview_samples?.length ? (
        <PreviewBlock
          samples={preview.preview_samples}
          mix={preview.scenario_mix ?? {}}
          grounded={preview.grounded_in_evidence ?? false}
          warnings={preview.warnings}
        />
      ) : null}

      {result && !result.preview_only ? (
        <div className="datasets-result">
          <p className="datasets-result-summary">
            {rowTotal} rows · {warningCount} warning{warningCount === 1 ? "" : "s"}
            {result.grounded_in_evidence ? " · evidence-grounded" : " · template"}
            {Object.keys(mix).length ? ` · mix ${formatMix(mix)}` : ""}
          </p>
          <div className="datasets-result-actions">
            <Link className="secondary" to={datasetRowsPath(datasetSlug)}>
              Review rows
            </Link>
            <Link className="primary" to="/tune/starter/build">
              Continue to Tune
            </Link>
          </div>
          <button
            className="datasets-details-toggle"
            type="button"
            onClick={() => setShowDetails((value) => !value)}
          >
            {showDetails ? "Hide details" : "Details"}
          </button>
          {showDetails ? (
            <dl className="datasets-details">
              <div>
                <dt>Train JSONL</dt>
                <dd>{result.examples_path}</dd>
              </div>
              <div>
                <dt>Handoff</dt>
                <dd>{result.manifest_path}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </DatasetsShell>
  );
}

function formatMix(mix: Record<string, number>) {
  return Object.entries(mix)
    .map(([key, count]) => `${key} ${count}`)
    .join(", ");
}

function PreviewBlock({
  samples,
  mix,
  grounded,
  warnings,
}: {
  samples: DatasetRow[];
  mix: Record<string, number>;
  grounded: boolean;
  warnings: string[];
}) {
  return (
    <div className="datasets-preview">
      <p className="datasets-preview-title">
        Preview ({samples.length} of planned) · {grounded ? "evidence-grounded" : "template"}
        {Object.keys(mix).length ? ` · ${formatMix(mix)}` : ""}
      </p>
      {warnings.map((warning) => (
        <p key={warning} className="datasets-hint datasets-hint--warn">
          {warning}
        </p>
      ))}
      {samples.map((row) => (
        <article key={row.id} className="datasets-preview-card">
          <span className="datasets-rows-scenario">{row.scenario_key}</span>
          {row.metadata?.evidence_claim_ids &&
          Array.isArray(row.metadata.evidence_claim_ids) &&
          row.metadata.evidence_claim_ids.length > 0 ? (
            <span className="datasets-preview-claims">
              claims: {(row.metadata.evidence_claim_ids as string[]).join(", ")}
            </span>
          ) : null}
          <p className="datasets-row-prompt">
            <strong>User</strong> {row.user_prompt}
          </p>
          <p className="datasets-row-answer">
            <strong>Assistant</strong> {row.assistant_answer}
          </p>
        </article>
      ))}
    </div>
  );
}
