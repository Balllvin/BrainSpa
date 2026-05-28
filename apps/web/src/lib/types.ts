export interface ToolStatus {
  key: string;
  label: string;
  available: boolean;
  command_path: string | null;
  version: string | null;
  setup_hint: string | null;
}

export interface AgentProfile {
  key: string;
  label: string;
  goal: string;
  default_backend: string;
  allowed_backends: string[];
  validation: string[];
}

export interface ModelProfile {
  key: string;
  label: string;
  base_model: string;
  role: string;
  state: string;
  parameter_count: string;
  hardware_fit: string;
  strengths: string[];
  known_failures: string[];
}

export interface HardwareProfile {
  system: string;
  machine: string;
  cpu_count: number;
  memory_gb: number | null;
  recommended_models: string[];
  notes: string[];
}

export interface DatasetProfile {
  key: string;
  label: string;
  goal: string;
  state: string;
  quality_notes: string[];
  warnings: string[];
  row_count: number;
  artifact_path: string | null;
}

export interface EnvironmentProfile {
  key: string;
  label: string;
  goal: string;
  harness: string;
  scoring: string[];
}

export interface SourceProfile {
  key: string;
  label: string;
  kind: string;
  provenance: string;
  summary: string;
  active: boolean;
}

export interface TelegramBotPublic {
  name: string;
  model_key: string;
  allowed_chat_id_configured: boolean;
  enabled: boolean;
  live_verified: boolean;
}

export type LoopStageKey = "evidence" | "datasets" | "tune" | "test";
export type AgentBackendKey = "codex" | "opencode" | "grok" | "cursor" | "hermes";

export interface LoopAgentSettings {
  key: LoopStageKey;
  label: string;
  backend: AgentBackendKey;
  telegram_bot_name: string | null;
  connected: boolean;
}

export interface BackendStatus {
  key: AgentBackendKey;
  label: string;
  installed: boolean;
  connected: boolean;
  version: string | null;
  command_path: string | null;
}

export interface ModelTelegramLink {
  model_key: string;
  model_label: string;
  model_state: string;
  telegram_bot_name: string | null;
}

export interface ChipmunkSettings {
  default_model_key: string;
  default_telegram_bot_name: string | null;
  voice_model: string;
  xai_configured: boolean;
}

export interface AppSettings {
  loop_agents: LoopAgentSettings[];
  backends: BackendStatus[];
  model_links: ModelTelegramLink[];
  telegram_bots: TelegramBotPublic[];
  chipmunk: ChipmunkSettings;
}

export interface ConnectStreamEvent {
  type: "log" | "auth" | "done" | "error";
  message: string;
}

export interface TelegramBotCreate {
  name: string;
  bot_token: string;
  model_key: string;
  allowed_chat_id?: string;
  enabled: boolean;
}

export interface BrainSpaOverview {
  product_name: string;
  local_only: boolean;
  runtime_root: string;
  hardware: HardwareProfile;
  tools: ToolStatus[];
  agents: AgentProfile[];
  projects: Array<{
    key: string;
    label: string;
    goal: string;
    active_model: string | null;
    active_dataset: string | null;
    environment: string | null;
  }>;
  sources: SourceProfile[];
  models: ModelProfile[];
  datasets: DatasetProfile[];
  environments: EnvironmentProfile[];
  telegram_bots: TelegramBotPublic[];
}

export interface DatasetGenerateResult {
  dataset: DatasetProfile;
  examples_path: string;
  manifest_path: string;
  preference_pairs_path: string;
  quality: string[];
  warnings: string[];
}

export interface TrainingDryRunResult {
  state: string;
  backend: string;
  model: string;
  dataset_key: string;
  output_dir: string;
  missing_requirements: string[];
  recipes: string[];
  notes: string[];
}

export interface TrainingAdapterBuildResult {
  state: string;
  model: string;
  dataset_key: string;
  rows_used: number;
  steps: number;
  loss: number | null;
  output_dir: string;
  missing_requirements: string[];
  notes: string[];
}

export interface EvalRunResult {
  environment_key: string;
  score: number;
  passed: boolean;
  comments: Array<{
    dimension: string;
    verdict: string;
    comment: string;
  }>;
  artifact_path: string;
}

export interface AdapterTestResult {
  state: string;
  model: string;
  adapter_path: string;
  prompt: string;
  answer: string;
  eval: EvalRunResult | null;
  missing_requirements: string[];
  notes: string[];
}

export interface WorkerRunResult {
  state: string;
  agent_key: string;
  backend: string;
  command_preview: string[];
  artifacts: string[];
  logs: string[];
}

export interface ChipmunkTranscribeResult {
  text: string;
  engine: string;
  notes: string[];
}

export interface ChipmunkChatResult {
  reply: string;
  routed_to: string;
  suggested_actions: string[];
}

export interface HermesSetup {
  repository: string;
  setup_commands: string[];
  required_env: string[];
  brain_spa_bridge: string;
  telegram_policy: string;
}

export interface TelegramAuthorizationResult {
  authorized: boolean;
  reason: string;
  routed_to: string | null;
  reply: string | null;
}
