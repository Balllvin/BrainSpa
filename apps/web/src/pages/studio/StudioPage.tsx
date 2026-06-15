import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { tuneHomePath } from "@/lib/tuneRoutes";
import {
  addBuiltinDataset,
  deleteMlDataset,
  deleteMlRun,
  fetchMlCatalog,
  fetchMlDatasets,
  fetchMlRuns,
  submitTraining,
  uploadMlDataset,
  type MlAlgoSpec,
  type MlCatalog,
  type MlDataset,
  type MlRun,
} from "@/lib/mlBackend";

import { TuneShell } from "../tune/TuneShell";

type Mode = "rl" | "supervised";

export function StudioPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<MlCatalog | null>(null);
  const [datasets, setDatasets] = useState<MlDataset[]>([]);
  const [runs, setRuns] = useState<MlRun[]>([]);
  const [mode, setMode] = useState<Mode>("rl");
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRuns = useCallback(async () => {
    const res = await fetchMlRuns();
    if (res.ok && res.data) setRuns(res.data);
  }, []);
  const loadDatasets = useCallback(async () => {
    const res = await fetchMlDatasets();
    if (res.ok && res.data) setDatasets(res.data);
  }, []);

  useEffect(() => {
    void fetchMlCatalog().then((res) => {
      if (res.ok && res.data) setCatalog(res.data);
      else setFlash(res.error ?? "Could not load the ML catalog.");
    });
    void loadDatasets();
    void loadRuns();
  }, [loadDatasets, loadRuns]);

  useEffect(() => {
    const id = setInterval(() => void loadRuns(), 3000);
    return () => clearInterval(id);
  }, [loadRuns]);

  return (
    <TuneShell title="Studio · train anything" backTo={tuneHomePath()} backLabel="Tune">
      <p className="studio-lede">
        Train a model from scratch — a reinforcement-learning policy on a registered environment, or a classifier/regressor on
        your own table. Runs stream live metrics and stay inspectable.
      </p>
      {flash ? <p className="studio-flash">{flash}</p> : null}

      <div className="studio-mode-toggle">
        <button className={mode === "rl" ? "primary" : "secondary"} onClick={() => setMode("rl")} type="button">
          Reinforcement learning
        </button>
        <button className={mode === "supervised" ? "primary" : "secondary"} onClick={() => setMode("supervised")} type="button">
          Supervised (tabular)
        </button>
      </div>

      {!catalog ? (
        <p className="tune-empty">Loading catalog…</p>
      ) : mode === "rl" ? (
        <RlLauncher
          catalog={catalog}
          busy={busy}
          onLaunch={async (envId, algo, hyperparams) => {
            setBusy(true);
            const res = await submitTraining({ kind: "rl", env_id: envId, algo, hyperparams });
            setBusy(false);
            if (res.ok && res.data) {
              await loadRuns();
              navigate(`/tune/studio/runs/${res.data.id}`);
            } else {
              setFlash(res.error ?? "Could not start training.");
            }
          }}
        />
      ) : (
        <SupervisedLauncher
          catalog={catalog}
          datasets={datasets}
          busy={busy}
          onLaunch={async (datasetId, target, algo, hyperparams) => {
            setBusy(true);
            const res = await submitTraining({ kind: "supervised", dataset_id: datasetId, target, algo, hyperparams });
            setBusy(false);
            if (res.ok && res.data) {
              await loadRuns();
              navigate(`/tune/studio/runs/${res.data.id}`);
            } else {
              setFlash(res.error ?? "Could not start training.");
            }
          }}
        />
      )}

      <DatasetManager
        catalog={catalog}
        datasets={datasets}
        onChange={async (msg) => {
          if (msg) setFlash(msg);
          await loadDatasets();
        }}
      />

      <RunsGallery
        runs={runs}
        onDelete={async (id) => {
          const res = await deleteMlRun(id);
          if (!res.ok) setFlash(res.error ?? "Could not remove run.");
          await loadRuns();
        }}
      />
    </TuneShell>
  );
}

// --- RL launcher -----------------------------------------------------------

function RlLauncher({
  catalog,
  busy,
  onLaunch,
}: {
  catalog: MlCatalog;
  busy: boolean;
  onLaunch: (envId: string, algo: string, hyperparams: Record<string, number>) => void;
}) {
  const [envId, setEnvId] = useState(catalog.environments[0]?.id ?? "");
  const env = catalog.environments.find((e) => e.id === envId);
  const algos = useMemo(
    () => catalog.rl_algorithms.filter((a) => (a.tags?.includes("discrete-state") ? Boolean(env?.tabular_ready) : true)),
    [catalog.rl_algorithms, env?.tabular_ready],
  );
  const [algoId, setAlgoId] = useState(algos[0]?.id ?? "");
  const algo = algos.find((a) => a.id === algoId) ?? algos[0];
  const [hp, setHp] = useState<Record<string, number>>({});

  useEffect(() => {
    if (algo) setHp(numericDefaults(algo));
  }, [algo?.id]);

  useEffect(() => {
    if (!algos.find((a) => a.id === algoId)) setAlgoId(algos[0]?.id ?? "");
  }, [algos, algoId]);

  return (
    <div className="studio-launcher">
      <div className="studio-pick">
        <h3 className="studio-h3">Environment</h3>
        <div className="studio-card-grid">
          {catalog.environments.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`studio-card${e.id === envId ? " studio-card--active" : ""}`}
              onClick={() => setEnvId(e.id)}
            >
              <strong>{e.label}</strong>
              <span className="studio-card-desc">{e.description}</span>
              <span className="studio-card-meta">
                {e.obs_dim} obs · {e.num_actions} actions{e.tabular_ready ? " · tabular" : ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="studio-pick">
        <h3 className="studio-h3">Algorithm</h3>
        <div className="studio-card-grid">
          {algos.map((a) => (
            <AlgoCard key={a.id} algo={a} active={a.id === algoId} onClick={() => a.available && setAlgoId(a.id)} />
          ))}
        </div>
      </div>

      {algo ? (
        <HyperparamEditor hp={hp} setHp={setHp} />
      ) : null}

      <div className="btn-row">
        <button className="primary" type="button" disabled={busy || !env || !algo || !algo.available} onClick={() => onLaunch(envId, algoId, hp)}>
          {busy ? "Launching…" : `Train ${algo?.label ?? ""} on ${env?.label ?? ""}`}
        </button>
      </div>
    </div>
  );
}

// --- Supervised launcher ---------------------------------------------------

function SupervisedLauncher({
  catalog,
  datasets,
  busy,
  onLaunch,
}: {
  catalog: MlCatalog;
  datasets: MlDataset[];
  busy: boolean;
  onLaunch: (datasetId: string, target: string, algo: string, hyperparams: Record<string, number>) => void;
}) {
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const dataset = datasets.find((d) => d.id === datasetId);
  const [target, setTarget] = useState("");
  const targetTask = useMemo(() => inferSupervisedTask(dataset, target), [dataset, target]);
  const algos = useMemo(
    () => catalog.supervised_algorithms.filter((a) => !targetTask || (a.tasks ?? []).includes(targetTask)),
    [catalog.supervised_algorithms, targetTask],
  );
  const [algoId, setAlgoId] = useState(algos[0]?.id ?? "");
  const algo = algos.find((a) => a.id === algoId);
  const [hp, setHp] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!datasetId && datasets[0]) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);
  useEffect(() => {
    if (dataset && !dataset.columns.find((c) => c.name === target)) {
      setTarget(dataset.columns[dataset.columns.length - 1]?.name ?? "");
    }
  }, [dataset, target]);
  useEffect(() => {
    if (!algos.find((a) => a.id === algoId)) setAlgoId(algos[0]?.id ?? "");
  }, [algos, algoId]);
  useEffect(() => {
    if (algo) setHp(numericDefaults(algo));
  }, [algo?.id]);

  if (!datasets.length) {
    return <p className="tune-empty">No tabular datasets yet. Add one below — upload a CSV/JSONL or generate a starter set.</p>;
  }

  return (
    <div className="studio-launcher">
      <div className="studio-row">
        <label className="field">
          <span>Dataset</span>
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.row_count} rows)
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Target column</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {(dataset?.columns ?? []).map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.dtype})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="studio-pick">
        <h3 className="studio-h3">Algorithm</h3>
        <div className="studio-card-grid">
          {algos.map((a) => (
            <AlgoCard key={a.id} algo={a} active={a.id === algoId} onClick={() => a.available && setAlgoId(a.id)} subtitle={(a.tasks ?? []).join(" / ")} />
          ))}
        </div>
      </div>

      {algo ? <HyperparamEditor hp={hp} setHp={setHp} /> : null}

      <div className="btn-row">
        <button
          className="primary"
          type="button"
          disabled={busy || !dataset || !target || !algo || !algo.available}
          onClick={() => onLaunch(datasetId, target, algoId, hp)}
        >
          {busy ? "Launching…" : `Fit ${algo?.label ?? ""}`}
        </button>
      </div>
    </div>
  );
}

// --- Shared pieces ---------------------------------------------------------

function AlgoCard({ algo, active, onClick, subtitle }: { algo: MlAlgoSpec; active: boolean; onClick: () => void; subtitle?: string }) {
  return (
    <button type="button" className={`studio-card${active ? " studio-card--active" : ""}${algo.available ? "" : " studio-card--disabled"}`} onClick={onClick} disabled={!algo.available}>
      <strong>{algo.label}</strong>
      <span className="studio-card-desc">{algo.description}</span>
      <span className="studio-card-meta">
        {subtitle ? `${subtitle} · ` : ""}
        {algo.needs_torch ? (algo.available ? "torch" : "needs torch") : "no deps"}
      </span>
    </button>
  );
}

function HyperparamEditor({ hp, setHp }: { hp: Record<string, number>; setHp: (next: Record<string, number>) => void }) {
  const keys = Object.keys(hp);
  if (!keys.length) return null;
  return (
    <details className="studio-hp">
      <summary>Hyperparameters ({keys.length})</summary>
      <div className="studio-hp-grid">
        {keys.map((key) => (
          <label className="field" key={key}>
            <span>{key}</span>
            <input
              type="number"
              value={hp[key]}
              step="any"
              onChange={(e) => setHp({ ...hp, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
    </details>
  );
}

function DatasetManager({ catalog, datasets, onChange }: { catalog: MlCatalog | null; datasets: MlDataset[]; onChange: (msg: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");

  async function onFile(file: File) {
    const text = await file.text();
    const format = file.name.endsWith(".jsonl") ? "jsonl" : file.name.endsWith(".json") ? "json" : "csv";
    const res = await uploadMlDataset(name || file.name, text, format);
    onChange(res.ok ? `Ingested ${file.name}.` : res.error ?? "Upload failed.");
    setName("");
  }

  return (
    <section className="studio-section">
      <h3 className="studio-h3">Datasets</h3>
      <div className="studio-row">
        <label className="field">
          <span>Name (optional)</span>
          <input value={name} placeholder="my-data" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Upload CSV / JSONL</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.jsonl,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </div>
      </div>
      <div className="btn-row studio-builtin-row">
        {(catalog?.builtin_datasets ?? []).map((b) => (
          <button
            key={b.name}
            className="secondary"
            type="button"
            title={b.description}
            onClick={async () => {
              const res = await addBuiltinDataset(b.name);
              onChange(res.ok ? `Added ${b.name} starter dataset.` : res.error ?? "Failed.");
            }}
          >
            + {b.name}
          </button>
        ))}
      </div>
      {datasets.length ? (
        <table className="studio-table">
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Rows</th>
              <th>Columns</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {datasets.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.row_count}</td>
                <td className="studio-mono">{d.columns.map((c) => c.name).join(", ")}</td>
                <td>
                  <button className="studio-link-danger" type="button" onClick={async () => { await deleteMlDataset(d.id); onChange(null); }}>
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="tune-empty">No datasets yet.</p>
      )}
    </section>
  );
}

function RunsGallery({ runs, onDelete }: { runs: MlRun[]; onDelete: (id: string) => void }) {
  return (
    <section className="studio-section">
      <h3 className="studio-h3">Runs</h3>
      {!runs.length ? (
        <p className="tune-empty">No runs yet. Launch a training run above.</p>
      ) : (
        <table className="studio-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Algo</th>
              <th>Target</th>
              <th>Status</th>
              <th>Score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link className="studio-link" to={`/tune/studio/runs/${r.id}`}>
                    {r.id}
                  </Link>
                </td>
                <td>{r.algo}</td>
                <td className="studio-mono">{describeTarget(r)}</td>
                <td>
                  <span className={`status-pill ${["complete"].includes(r.status) ? "status-pill-live" : "status-pill-offline"}`}>{r.status}</span>
                </td>
                <td>{scoreOf(r)}</td>
                <td>
                  <button className="studio-link-danger" type="button" disabled={!isTerminalRun(r.status)} onClick={() => onDelete(r.id)}>
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// --- helpers ---------------------------------------------------------------

function numericDefaults(algo: MlAlgoSpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(algo.default_hyperparams)) {
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

function describeTarget(run: MlRun): string {
  if (run.kind === "rl") return String(run.target.env_id ?? "");
  return `${String(run.target.dataset_name ?? run.target.dataset_id ?? "")} → ${String(run.target.target_column ?? "")}`;
}

function inferSupervisedTask(dataset: MlDataset | undefined, target: string): "classification" | "regression" | null {
  const column = dataset?.columns.find((c) => c.name === target);
  if (!dataset || !column) return null;
  if (column.dtype !== "numeric") return "classification";
  const unique = column.unique ?? dataset.row_count;
  return unique > Math.max(15, Math.floor(dataset.row_count / 20)) ? "regression" : "classification";
}

function isTerminalRun(status: string): boolean {
  return ["complete", "failed", "stopped"].includes(status);
}

export function scoreOf(run: MlRun): string {
  const summary = run.summary as Record<string, unknown> | null;
  if (!summary) return "—";
  if (run.kind === "rl") {
    const evalObj = summary.evaluation as Record<string, unknown> | undefined;
    const mean = evalObj?.mean_return ?? summary.best_mean_return;
    return typeof mean === "number" ? mean.toFixed(2) : "—";
  }
  const metrics = summary.metrics as Record<string, number> | undefined;
  if (!metrics) return "—";
  if ("accuracy" in metrics) return `acc ${metrics.accuracy}`;
  if ("r2" in metrics) return `R² ${metrics.r2}`;
  return "—";
}
