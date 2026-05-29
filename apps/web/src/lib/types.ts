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

export interface HarnessProfile {
  key: LoopStageKey;
  label: string;
  owner: string;
  purpose: string;
  default_backend: AgentBackendKey;
  world_state: string[];
  allowed_actions: string[];
  tools: string[];
  scoring_rules: string[];
  failure_comments: string[];
  template_artifacts: string[];
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
  feeds_models?: string[];
}

export type EvidenceClaimStatus = "pending" | "approved" | "rejected" | "weak";

export interface EvidenceSourceSummary {
  key: string;
  label: string;
  kind: string;
  summary: string;
  provenance: string;
  feeds_models: string[];
  feeds_model_labels: string[];
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  weak_count: number;
  last_ingest_at: string | null;
  ready_for_datasets: boolean;
}

export interface EvidenceModelSummary {
  model_slug: string;
  display_name: string;
  behavior_focus: string;
  approved_count: number;
  pending_count: number;
  weak_count: number;
  rejected_count: number;
  ready_for_datasets: boolean;
  source_keys: string[];
}

export interface EvidenceClaim {
  id: string;
  source_key: string;
  source_label?: string | null;
  text: string;
  citation: string;
  status: EvidenceClaimStatus;
  ingested_at: string;
  updated_at: string;
  ingest_run_id?: string | null;
  manual?: boolean;
}

export interface EvidenceClaimCreate {
  text: string;
  citation: string;
  source_key: string;
}

export interface EvidenceBulkApproveResult {
  approved_count: number;
  approved_claim_ids: string[];
  skipped_without_citation: number;
}

export interface EvidenceSourceDetail {
  source: SourceProfile;
  behavior_focus: string;
  ingest_focus: string | null;
  last_ingest_at: string | null;
  claims: EvidenceClaim[];
  artifact_paths: Record<string, string>;
}

export interface EvidenceIngestResult {
  source_key: string;
  ingest_run_id: string;
  backend: string;
  claims_added: number;
  ingested_at: string;
  manifest_path: string;
  claim_ids: string[];
  ingest_focus?: string | null;
}

export interface EvidenceNotes {
  behavior_focus: string;
  sources: Record<string, unknown>;
  notes_path: string;
}

export interface EvidenceApprovedClaimsResponse {
  approved_count: number;
  claims: EvidenceClaim[];
  manifest_path: string;
  ready_for_datasets: boolean;
}

export interface TelegramBotPublic {
  name: string;
  model_key: string;
  allowed_chat_id_configured: boolean;
  enabled: boolean;
  live_verified: boolean;
}

export interface TelegramPollResult {
  updates_seen: number;
  messages_sent: number;
  feedback_saved: number;
  skipped: number;
  errors: string[];
}

export interface TelegramPollerStatus {
  running: boolean;
  last_result: TelegramPollResult;
  last_error: string | null;
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
  harnesses: HarnessProfile[];
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

export interface DatasetEvidenceGate {
  approved_count: number;
  ready: boolean;
  manifest_path: string | null;
  message: string;
}

export interface DatasetGenerateOptions {
  example_count: number;
  scenarios: string[];
  scenario_weights: Record<string, number>;
  mix_even: boolean;
  ground_in_evidence: boolean;
  preview_only: boolean;
  pack?: string | null;
}

export interface DatasetGenerateResult {
  dataset: DatasetProfile;
  examples_path: string;
  manifest_path: string;
  preference_pairs_path: string;
  quality: string[];
  warnings: string[];
  evidence_gate?: DatasetEvidenceGate | null;
  preview_only?: boolean;
  preview_samples?: DatasetRow[];
  scenario_mix?: Record<string, number>;
  grounded_in_evidence?: boolean;
}

export interface DatasetRowCreate {
  scenario_key: string;
  user_prompt: string;
  assistant_answer: string;
  failure_labels?: string[];
  evidence_claim_ids?: string[];
}

export interface DatasetPreferencePairCreate {
  prompt: string;
  chosen: string;
  rejected: string;
  failure_labels?: string[];
  scenario_key?: string;
}

export interface DatasetPreferencePairResult {
  dataset_key: string;
  pair_id: string;
  message: string;
}

export interface DatasetRow {
  id: string;
  user_prompt: string;
  assistant_answer: string;
  scenario_key: string;
  failure_labels: string[];
  source: string;
  metadata: Record<string, unknown>;
}

export interface DatasetRowPage {
  dataset_key: string;
  total: number;
  offset: number;
  limit: number;
  rows: DatasetRow[];
}

export interface DatasetImportFeedbackResult {
  dataset_key: string;
  imported_count: number;
  skipped_duplicates: number;
  pending_feedback_count: number;
  message: string;
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

export type TrainingPreset = "fast" | "standard" | "quality";

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
  training_preset?: TrainingPreset;
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

export interface HarnessChatMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  prompt?: string | null;
  model?: string | null;
  adapter_path?: string | null;
  reply_to_message_id?: number | null;
  eval?: EvalRunResult | null;
}

export interface HarnessChatThread {
  model_key: string;
  scenario_key: string;
  messages: HarnessChatMessage[];
}

export interface TestScenario {
  key: string;
  label: string;
  mode: "chat" | "generate";
  placeholder: string;
  hint: string;
}

export interface HarnessChatSendResult {
  kind: "assistant_reply" | "feedback_saved";
  message: HarnessChatMessage;
  generation_state?: string | null;
  missing_requirements: string[];
  feedback_recorded: boolean;
}

export interface AcceptanceRunResult {
  state: string;
  model: string;
  adapter_path: string;
  cases: Array<{
    prompt: string;
    answer: string;
    score: number;
    passed: boolean;
    comments: EvalRunResult["comments"];
  }>;
  passed: boolean;
  missing_requirements: string[];
  artifact_path: string;
  notes: string[];
}

export interface TuneAcceptanceSummary {
  state: string;
  passed: boolean | null;
  cases_passed: number;
  cases_total: number;
  artifact_path: string | null;
}

export interface TuneModelStatus {
  model_key: string;
  slug: string;
  label: string;
  display_name: string;
  project_key: string;
  adapter_path: string;
  adapter_state: "missing" | "ready" | "blocked" | "stale";
  dataset_key: string | null;
  dataset_row_count: number;
  build_dataset_key: string | null;
  build_rows_used: number | null;
  build_state: string | null;
  built_at: string | null;
  stale: boolean;
  stale_reason: string | null;
  dry_run_state: string | null;
  missing_requirements: string[];
  acceptance: TuneAcceptanceSummary | null;
}

export interface TuneStatusResponse {
  models: TuneModelStatus[];
}

export interface TuneScenarioCount {
  key: string;
  label: string;
  count: number;
}

export interface TuneBuildPreview {
  model_key: string;
  slug: string;
  dataset_key: string;
  dataset_slug: string;
  dataset_display_label: string;
  row_count: number;
  scenario_breakdown: TuneScenarioCount[];
  adapter_state: TuneModelStatus["adapter_state"];
  built_at: string | null;
  build_rows_used: number | null;
  stale: boolean;
  stale_reason: string | null;
  training_preset_default: TrainingPreset;
}

export interface TuneBuildJob {
  state: "idle" | "running" | "complete" | "blocked" | "failed";
  phase: string;
  model_key: string;
  dataset_key: string;
  training_preset: TrainingPreset;
  result: TrainingAdapterBuildResult | null;
  error: string | null;
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
