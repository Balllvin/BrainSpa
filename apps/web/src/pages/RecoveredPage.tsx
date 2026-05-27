import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { fetchBrainSpaOverview, updateDatasetState, updateModelState } from "@/lib/backend";
import type { BrainSpaOverview } from "@/lib/types";

type RegistryTab = "projects" | "sources" | "models" | "datasets" | "environments";

function tabFromPath(pathname: string): RegistryTab {
  if (pathname.includes("/sources")) return "sources";
  if (pathname.includes("/models")) return "models";
  if (pathname.includes("/datasets")) return "datasets";
  if (pathname.includes("/environments")) return "environments";
  return "projects";
}

const TABS: Array<{ key: RegistryTab; label: string; path: string }> = [
  { key: "projects", label: "Projects", path: "/registry" },
  { key: "sources", label: "Sources", path: "/registry/sources" },
  { key: "models", label: "Models", path: "/registry/models" },
  { key: "datasets", label: "Datasets", path: "/registry/datasets" },
  { key: "environments", label: "Environments", path: "/registry/environments" },
];

export function RecoveredPage() {
  const location = useLocation();
  const tab = tabFromPath(location.pathname);
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const result = await fetchBrainSpaOverview();
    setOnline(result.ok);
    setOverview(result.overview);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setMessage(null);
  }, [location.pathname]);

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <h1>Registry</h1>
          <span className={`status-pill ${online ? "status-pill-live" : "status-pill-offline"}`}>
            {online === null ? "checking api" : online ? "api connected" : "api offline"}
          </span>
        </div>
        <nav className="subnav" aria-label="Registry sections">
          {TABS.map((item) => (
            <Link
              className={`subnav-link${tab === item.key ? " subnav-link-active" : ""}`}
              key={item.key}
              to={item.path}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {tab === "projects" ? <ProjectsPanel overview={overview} /> : null}
        {tab === "sources" ? <SourcesPanel overview={overview} /> : null}
        {message ? <p className="muted" style={{ marginTop: 10 }}>{message}</p> : null}
        {tab === "models" ? <ModelsPanel overview={overview} onChanged={refresh} setMessage={setMessage} /> : null}
        {tab === "datasets" ? <DatasetsPanel overview={overview} onChanged={refresh} setMessage={setMessage} /> : null}
        {tab === "environments" ? <EnvironmentsPanel overview={overview} /> : null}
      </section>
    </div>
  );
}

function ProjectsPanel({ overview }: { overview: BrainSpaOverview | null }) {
  return (
    <>
      <div className="row-group" style={{ marginTop: 14 }}>
        {(overview?.projects ?? []).map((project) => (
          <article className="data-row" key={project.key}>
            <div>
              <h3>{project.label}</h3>
              <p>{project.active_dataset ?? "no dataset"}</p>
            </div>
            <dl className="meta-dl">
              <div>
                <dt>Model</dt>
                <dd>{project.active_model ?? "none"}</dd>
              </div>
              <div>
                <dt>Environment</dt>
                <dd>{project.environment ?? "none"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function SourcesPanel({ overview }: { overview: BrainSpaOverview | null }) {
  return (
    <>
      <div className="row-group" style={{ marginTop: 14 }}>
        {(overview?.sources ?? []).map((source) => (
          <article className="data-row" key={source.key}>
            <div>
              <span className={`status-pill ${source.active ? "status-pill-live" : "status-pill-offline"}`}>
                {source.kind}
              </span>
              <h3>{source.label}</h3>
              <code className="code-path">{source.provenance}</code>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function ModelsPanel({
  overview,
  onChanged,
  setMessage,
}: {
  overview: BrainSpaOverview | null;
  onChanged: () => Promise<void>;
  setMessage: (message: string | null) => void;
}) {
  async function setModelState(modelKey: string, state: string) {
    const result = await updateModelState(modelKey, state);
    setMessage(result.ok ? `Model ${modelKey} is now ${state}.` : result.error);
    if (result.ok) await onChanged();
  }

  return (
    <>
      <div className="row-group" style={{ marginTop: 14 }}>
        {(overview?.models ?? []).map((model) => (
          <article className="data-row" key={model.key}>
            <div>
              <span className="status-pill status-pill-live">{model.state}</span>
              <h3>{model.label}</h3>
              <code className="code-path">{model.base_model}</code>
            </div>
            <dl className="meta-dl">
              <div>
                <dt>Size</dt>
                <dd>{model.parameter_count}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{model.key}</dd>
              </div>
            </dl>
            <div className="btn-row">
              {model.state === "active" ? (
                <button className="secondary" type="button" onClick={() => setModelState(model.key, "retired")}>
                  Retire
                </button>
              ) : model.state === "retired" || model.state === "failed" ? (
                <button className="secondary" type="button" onClick={() => setModelState(model.key, "candidate")}>
                  Restore
                </button>
              ) : (
                <>
                  <button className="secondary" type="button" onClick={() => setModelState(model.key, "active")}>
                    Activate
                  </button>
                  <button className="secondary" type="button" onClick={() => setModelState(model.key, "retired")}>
                    Retire
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function DatasetsPanel({
  overview,
  onChanged,
  setMessage,
}: {
  overview: BrainSpaOverview | null;
  onChanged: () => Promise<void>;
  setMessage: (message: string | null) => void;
}) {
  async function setDatasetState(datasetKey: string, state: string) {
    const result = await updateDatasetState(datasetKey, state);
    setMessage(result.ok ? `Dataset ${datasetKey} is now ${state}.` : result.error);
    if (result.ok) await onChanged();
  }

  return (
    <>
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
                <dt>Quality</dt>
                <dd>{dataset.quality_notes.length}</dd>
              </div>
              <div>
                <dt>Warnings</dt>
                <dd>{dataset.warnings.length}</dd>
              </div>
            </dl>
            <div className="btn-row">
              {dataset.state === "active" ? (
                <button className="secondary" type="button" onClick={() => setDatasetState(dataset.key, "retired")}>
                  Retire
                </button>
              ) : dataset.state === "retired" ? (
                <button className="secondary" type="button" onClick={() => setDatasetState(dataset.key, "validated")}>
                  Restore
                </button>
              ) : (
                <>
                  <button className="secondary" type="button" onClick={() => setDatasetState(dataset.key, "active")}>
                    Activate
                  </button>
                  <button className="secondary" type="button" onClick={() => setDatasetState(dataset.key, "retired")}>
                    Retire
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function EnvironmentsPanel({ overview }: { overview: BrainSpaOverview | null }) {
  return (
    <>
      <div className="row-group" style={{ marginTop: 14 }}>
        {(overview?.environments ?? []).map((environment) => (
          <article className="data-row" key={environment.key}>
            <div>
              <h3>{environment.label}</h3>
              <code className="code-path">{environment.harness}</code>
            </div>
            <dl className="meta-dl">
              {environment.scoring.slice(0, 4).map((score) => (
                <div key={score}>
                  <dt>Score</dt>
                  <dd>{score}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
