import { datasetDisplayLabel } from "@/lib/datasetsRoutes";
import type { DatasetProfile, TrainingPreset, TuneBuildJob, TuneModelStatus } from "@/lib/types";

export function adapterStatusLabel(state: TuneModelStatus["adapter_state"]): string {
  switch (state) {
    case "ready":
      return "Ready";
    case "stale":
      return "Stale";
    case "blocked":
      return "Blocked";
    default:
      return "Missing";
  }
}

export function formatDatasetOptionLabel(dataset: DatasetProfile): string {
  const label = datasetDisplayLabel(dataset.key, dataset.label);
  return `${label} (${dataset.row_count} rows)`;
}

export function formatMissingRequirements(items: string[]): string {
  const labels: Record<string, string> = {
    torch: "PyTorch",
    transformers: "Transformers",
    peft: "PEFT",
    datasets: "Datasets",
    trl: "TRL",
    generated_dataset: "Training rows — generate a dataset first",
    adapter_artifact: "Adapter — run a build first",
  };
  return items.map((item) => labels[item] ?? item.replaceAll("_", " ")).join(", ");
}

export function formatBuiltAt(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const TRAINING_PRESETS: Array<{ id: TrainingPreset; label: string; hint: string }> = [
  { id: "fast", label: "Fast", hint: "Quick smoke train — fewer passes" },
  { id: "standard", label: "Standard", hint: "Balanced default" },
  { id: "quality", label: "Quality", hint: "More passes — slower" },
];

const BUILD_PHASE_LABELS: Record<string, string> = {
  idle: "Waiting",
  starting: "Starting build…",
  checking_requirements: "Checking trainer…",
  checking_dataset: "Checking dataset…",
  loading_model: "Loading base model…",
  training: "Training adapter…",
  saving: "Saving adapter…",
  done: "Build complete",
  blocked: "Build blocked",
  failed: "Build failed",
};

export function buildPhaseLabel(job: TuneBuildJob | null): string {
  if (!job) return "Waiting";
  return BUILD_PHASE_LABELS[job.phase] ?? "Working…";
}

export function presetLabel(preset: TrainingPreset): string {
  return TRAINING_PRESETS.find((item) => item.id === preset)?.label ?? preset;
}
