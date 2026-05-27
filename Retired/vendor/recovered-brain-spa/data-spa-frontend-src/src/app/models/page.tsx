import Link from "next/link";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

type ModelRecord = {
  key: string;
  name: string;
  adapterPath: string;
  datasetPath: string;
  repairDatasetPath: string;
  hubModelId: string;
  status: string;
  finalTrainLoss: number | null;
};

const SUITE_ROOT = path.resolve(process.cwd(), "..", "..", "..", "brain-dataset-forge", "outputs", "liquid-persona-suite");

async function fileSizeLabel(filePath: string): Promise<string> {
  try {
    const size = (await stat(filePath)).size;
    if (size > 1024 * 1024) {
      return `${Math.round(size / (1024 * 1024))} MB`;
    }
    return `${Math.round(size / 1024)} KB`;
  } catch {
    return "missing";
  }
}

async function lineCountLabel(filePath: string): Promise<string> {
  try {
    const text = await readFile(filePath, "utf8");
    return `${text.split("\n").filter(Boolean).length} rows`;
  } catch {
    return "missing";
  }
}

async function loadModels(): Promise<ModelRecord[]> {
  const activeModels = JSON.parse(await readFile(path.join(SUITE_ROOT, "active_models.json"), "utf8"));
  const trainingStatus = JSON.parse(await readFile(path.join(SUITE_ROOT, "training_status.json"), "utf8"));
  return [
    ["believer", "The Believer"],
    ["retardmaxxer", "Retardmaxxer"],
    ["chess", "Chess Player"],
  ].map(([key, name]) => {
    const model = activeModels.models[key];
    const training = trainingStatus.models[key];
    return {
      key,
      name,
      adapterPath: path.join(SUITE_ROOT, "adapters", key, "adapter_model.safetensors"),
      datasetPath: path.join(SUITE_ROOT, key, "dataset_sft_train.jsonl"),
      repairDatasetPath: path.join(SUITE_ROOT, "conviction-repair", key, "dataset_sft_train.jsonl"),
      hubModelId: model.hub_model_id,
      status: model.status,
      finalTrainLoss: training.final_train_loss ?? null,
    };
  });
}

export default async function ModelsPage() {
  const models = await loadModels();
  const details = await Promise.all(
    models.map(async (model) => ({
      ...model,
      adapterSize: await fileSizeLabel(model.adapterPath),
      datasetRows: await lineCountLabel(model.datasetPath),
      repairRows: await lineCountLabel(model.repairDatasetPath),
    }))
  );

  return (
    <main className="page-grid">
      <section className="panel stack workspace-panel">
        <div className="page-title-block">
          <h1>Models</h1>
          <p className="muted">Recovered local post-tune adapters and datasets from the Liquid persona suite.</p>
        </div>
        <div className="row-group">
          {details.map((model) => (
            <article className="project-row" key={model.key}>
              <div className="project-row-content stack tight">
                <h3>{model.name}</h3>
                <p>{model.hubModelId}</p>
                <code className="artifact-path">{model.adapterPath}</code>
              </div>
              <dl className="project-stats project-row-meta">
                <div>
                  <dt>Adapter</dt>
                  <dd>{model.adapterSize}</dd>
                </div>
                <div>
                  <dt>Train</dt>
                  <dd>{model.datasetRows}</dd>
                </div>
                <div>
                  <dt>Repair</dt>
                  <dd>{model.repairRows}</dd>
                </div>
                <div>
                  <dt>Loss</dt>
                  <dd>{model.finalTrainLoss ?? "n/a"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <Link className="secondary" href="/">
          Open projects
        </Link>
      </section>
    </main>
  );
}
