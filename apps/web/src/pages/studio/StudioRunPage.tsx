import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { MetricChart } from "@/components/MetricChart";
import { tuneHomePath } from "@/lib/tuneRoutes";
import { fetchMlRun, inferMlRun, stopMlRun, streamMlRun, type MlMetric, type MlRun } from "@/lib/mlBackend";

import { TuneShell } from "../tune/TuneShell";
import { scoreOf } from "./StudioPage";

export function StudioRunPage() {
  const { runId = "" } = useParams();
  const [run, setRun] = useState<MlRun | null>(null);
  const [metrics, setMetrics] = useState<MlMetric[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = () => {};
    void fetchMlRun(runId).then((res) => {
      if (!res.ok || !res.data) {
        setError(res.error ?? "Run not found.");
        return;
      }
      setRun(res.data);
      setMetrics(res.data.metrics ?? []);
      if (["complete", "failed", "stopped"].includes(res.data.status)) return;
      stop = streamMlRun(runId, (event) => {
        if (event.metrics) setMetrics((prev) => [...prev, ...event.metrics!]);
        if (event.run) setRun((prev) => (prev ? { ...prev, ...event.run } : prev));
        if (event.type === "done" && event.run) {
          setRun(event.run as MlRun);
          void fetchMlRun(runId).then((r) => r.ok && r.data && setMetrics(r.data.metrics ?? []));
        }
      });
    });
    return () => stop();
  }, [runId]);

  const chartSeries = useMemo(() => buildSeries(run, metrics), [run, metrics]);
  const xLabel = run?.kind === "supervised" ? "epoch" : "episode";

  if (error) return <TuneShell title="Run" backTo="/tune/studio" backLabel="Studio"><p className="tune-error">{error}</p></TuneShell>;
  if (!run) return <TuneShell title="Run" backTo="/tune/studio" backLabel="Studio"><p className="tune-empty">Loading…</p></TuneShell>;

  const running = !["complete", "failed", "stopped"].includes(run.status);

  return (
    <TuneShell title={`Run · ${run.id}`} backTo="/tune/studio" backLabel="Studio">
      <div className="studio-run-head">
        <div>
          <strong className="studio-run-label">{run.label}</strong>
          <span className="studio-card-meta">{run.algo} · {run.kind}</span>
        </div>
        <span className={`status-pill ${run.status === "complete" ? "status-pill-live" : "status-pill-offline"}`}>{run.status}</span>
      </div>

      {run.error ? <p className="tune-error">{run.error}</p> : null}

      <section className="studio-section">
        <div className="studio-run-stat-row">
          <Stat label="Metrics" value={String(metrics.length)} />
          <Stat label={run.kind === "rl" ? "mean return" : "test score"} value={scoreOf(run)} />
          <Stat label="last" value={lastMetricLabel(run)} />
          {running ? (
            <button className="secondary" type="button" onClick={async () => { await stopMlRun(run.id); }}>
              Stop
            </button>
          ) : null}
        </div>
        <MetricChart series={chartSeries} yLabel={run.kind === "supervised" ? "loss" : "return"} xLabel={xLabel} />
      </section>

      <SummaryCard run={run} />
      <InferencePanel run={run} />

      <p className="studio-foot">
        Checkpoint: <span className="studio-mono">{run.checkpoint_path ?? "—"}</span> · Loop home:{" "}
        <a className="studio-link" href={tuneHomePath()}>Tune</a>
      </p>
    </TuneShell>
  );
}

function buildSeries(run: MlRun | null, metrics: MlMetric[]) {
  if (!run) return [];
  if (run.kind === "supervised") {
    return [
      { label: "train_loss", points: metrics.filter((m) => m.train_loss != null).map((m) => ({ x: m.epoch ?? 0, y: m.train_loss as number })) },
    ];
  }
  return [
    { label: "mean_return", points: metrics.filter((m) => m.mean_return != null).map((m) => ({ x: m.episode ?? 0, y: m.mean_return as number })) },
    { label: "episode_return", color: "#5ad1c8", points: metrics.filter((m) => m.episode_return != null).map((m) => ({ x: m.episode ?? 0, y: m.episode_return as number })) },
  ];
}

function lastMetricLabel(run: MlRun): string {
  const m = run.last_metric;
  if (!m) return "—";
  if (run.kind === "supervised") return m.train_loss != null ? `loss ${m.train_loss}` : "—";
  return m.mean_return != null ? `return ${m.mean_return}` : "—";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="studio-stat">
      <span className="studio-stat-value">{value}</span>
      <span className="studio-stat-label">{label}</span>
    </div>
  );
}

function SummaryCard({ run }: { run: MlRun }) {
  const summary = run.summary as Record<string, unknown> | null;
  if (!summary) return null;
  const evalObj = (summary.evaluation ?? summary.metrics) as Record<string, unknown> | undefined;
  return (
    <section className="studio-section">
      <h3 className="studio-h3">Result</h3>
      <div className="studio-kv-grid">
        {Object.entries(evalObj ?? {}).map(([k, v]) => (
          <div className="studio-kv" key={k}>
            <span className="studio-kv-key">{k}</span>
            <span className="studio-kv-value">{typeof v === "number" ? v.toFixed(3) : String(v)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function InferencePanel({ run }: { run: MlRun }) {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [row, setRow] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const features = useMemo(() => {
    const summary = run.summary as Record<string, unknown> | null;
    return (summary?.features as string[]) ?? [];
  }, [run.summary]);

  if (run.status !== "complete") {
    return (
      <section className="studio-section">
        <h3 className="studio-h3">Use the model</h3>
        <p className="tune-empty">Available once the run completes.</p>
      </section>
    );
  }

  async function runInfer() {
    setBusy(true);
    if (run.kind === "rl") {
      const res = await inferMlRun(run.id, {});
      setResult(res.data ?? { error: res.error });
    } else {
      const typed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) typed[k] = isNumeric(v) ? Number(v) : v;
      const res = await inferMlRun(run.id, { row: typed });
      setResult(res.data ?? { error: res.error });
    }
    setBusy(false);
  }

  return (
    <section className="studio-section">
      <h3 className="studio-h3">Use the model</h3>
      {run.kind === "rl" ? (
        <p className="field-hint">Roll out one greedy episode with the trained policy.</p>
      ) : (
        <div className="studio-hp-grid">
          {features.map((f) => (
            <label className="field" key={f}>
              <span>{f}</span>
              <input value={row[f] ?? ""} onChange={(e) => setRow({ ...row, [f]: e.target.value })} />
            </label>
          ))}
        </div>
      )}
      <div className="btn-row">
        <button className="primary" type="button" disabled={busy} onClick={runInfer}>
          {busy ? "Running…" : run.kind === "rl" ? "Run episode" : "Predict"}
        </button>
      </div>
      {result ? <pre className="studio-result">{formatResult(result)}</pre> : null}
    </section>
  );
}

function formatResult(result: Record<string, unknown>): string {
  const compact = { ...result };
  delete (compact as { frames?: unknown }).frames;
  if ("frames" in result && Array.isArray((result as { frames?: unknown[] }).frames)) {
    (compact as Record<string, unknown>).frames = `${(result as { frames: unknown[] }).frames.length} steps`;
  }
  return JSON.stringify(compact, null, 2);
}

function isNumeric(value: string): boolean {
  return value.trim() !== "" && !Number.isNaN(Number(value));
}
