import { buildBackendUrl } from "@/lib/backend-url";

type RecoveryArtifact = {
  id: number;
  project_name: string;
  artifact_type: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  available_local: number;
};

type RecoveryInventory = {
  totals: {
    dataset_count: number;
    artifact_count: number;
    unavailable_artifact_count: number;
  };
  artifacts: RecoveryArtifact[];
};

function sizeLabel(size: number): string {
  if (size >= 1024 * 1024) {
    return `${Math.round(size / (1024 * 1024))} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

async function loadInventory(): Promise<RecoveryInventory> {
  const response = await fetch(buildBackendUrl("/api/recovery/inventory"), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Recovery inventory request failed: ${response.status}`);
  }
  return response.json();
}

export default async function DatasetsPage() {
  const inventory = await loadInventory();
  const datasets = inventory.artifacts.filter((artifact) => artifact.artifact_type === "dataset");

  return (
    <main className="page-grid">
      <section className="panel stack workspace-panel">
        <div className="page-title-block">
          <h1>Datasets</h1>
          <p className="muted">
            {datasets.length} dataset artifacts recovered from local Brain Spa and Dataset Forge outputs.
          </p>
        </div>
        <div className="row-group">
          {datasets.map((artifact) => (
            <article className="project-row" key={artifact.id}>
              <div className="project-row-content stack tight">
                <h3>{artifact.filename}</h3>
                <p>{artifact.project_name}</p>
                <code className="artifact-path">{artifact.storage_path}</code>
              </div>
              <dl className="project-stats project-row-meta">
                <div>
                  <dt>Size</dt>
                  <dd>{sizeLabel(artifact.size_bytes)}</dd>
                </div>
                <div>
                  <dt>Local</dt>
                  <dd>{artifact.available_local ? "Readable" : "Dataless"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
