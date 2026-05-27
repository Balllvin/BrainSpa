export interface AuthResponse {
  user_id: number;
  email: string;
  full_name: string;
  message?: string;
}

export interface MeResponse {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
}

export interface SessionInfo {
  session_id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface SessionBootstrapResponse {
  resolved: boolean;
  auth_configured: boolean;
  user: MeResponse | null;
}

export interface ProjectBrief {
  target_style: string;
  target_behaviors: string;
  avoidances: string;
  stable_traits: string;
  tone_notes: string;
  core_values: string;
  recurring_beliefs: string;
  humor_style: string;
  relationship_stance: string;
  expertise_claims: string;
  knowledge_limits: string;
  taboo_zones: string;
  off_domain_policy: string;
  temporal_scope: string;
  uncertainty_style: string;
}

export type SetupSection = keyof ProjectBrief;

export interface ProjectSetupGenerationRequest {
  name: string;
  goal: string;
  section: SetupSection;
  current_draft?: Partial<ProjectBrief>;
}

export interface ProjectSetupGenerationResponse {
  section: SetupSection;
  text: string;
  warning: string | null;
}

export interface WorkspaceSetupDraft extends ProjectBrief {
  name: string;
  goal: string;
}

export interface TranscriptSummary {
  id: number;
  source_name: string;
  source_type: string;
  created_at: string;
  text: string;
  char_count: number;
  metadata: Record<string, unknown>;
}

export interface ProjectUiPreference {
  persona_fields_expanded: boolean;
}

export interface GenerationJob {
  id: number;
  job_type: string;
  target_key: string;
  status: string;
  warning_message: string | null;
  error_message: string | null;
  result: Record<string, unknown>;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface PersonaFieldState {
  key: SetupSection;
  label: string;
  value: string;
  generation_status: string;
  error_message: string | null;
  provenance: Record<string, unknown>;
  last_generated_at: string | null;
}

export interface ArtifactSummary {
  id: number;
  artifact_type: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface PublishedBundle {
  bundle_root: string;
  bundle_dir: string;
  handoff_path: string;
  artifact_count: number;
}

export interface EvidenceSummary {
  id: number;
  transcript_id: number | null;
  title: string;
  source_type: string;
  source_label: string;
  content_text: string;
  citation_url: string | null;
  source_span: string | null;
  trust_level: string;
  approval_state: string;
  created_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AssistantSuggestionResponse {
  model: string;
  task: string;
  used_fallback: boolean;
  fallback_reason: string | null;
  persona_gaps: string[];
  evidence_suggestions: EvidenceSummary[];
  brief_patch: Record<string, string>;
  operator_notes: string[];
  toolchain: Array<Record<string, unknown>>;
}

export interface RunEvent {
  id: number;
  stage: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface RunSummary {
  id: number;
  status: string;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  warnings: string[];
  summary: Record<string, unknown>;
  transcript_ids: number[];
}

export interface ProjectSummary {
  id: number;
  name: string;
  description: string;
  learning_goal: string;
  status: string;
  created_at: string;
  updated_at: string;
  transcript_count: number;
  run_count: number;
}

export interface ProjectSettingsResponse extends ProjectSummary {}

export interface ProjectDetail extends ProjectSummary {
  brief: ProjectBrief;
  transcripts: TranscriptSummary[];
  evidence_items: EvidenceSummary[];
  runs: RunSummary[];
}

export interface RunDetail extends RunSummary {
  artifacts: ArtifactSummary[];
  events: RunEvent[];
}

export type WorkerState = "online" | "stale" | "missing" | "error";

export interface WorkerStatus {
  state: WorkerState;
  online: boolean;
  stale: boolean;
  worker_name: string | null;
  runtime_role: string | null;
  last_seen_at: string | null;
  message: string;
}

export interface PageInfo {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface PersonaPageData {
  project: ProjectSummary;
  preferences: ProjectUiPreference;
  fields: PersonaFieldState[];
  jobs: GenerationJob[];
  worker: WorkerStatus;
}

export interface PersonaStatusData {
  preferences: ProjectUiPreference;
  fields: PersonaFieldState[];
  jobs: GenerationJob[];
  worker: WorkerStatus;
}

export interface TranscriptsPageData {
  project: ProjectSummary;
  transcripts: TranscriptSummary[];
  jobs: GenerationJob[];
  pagination: PageInfo;
}

export interface RunsPageData {
  project: ProjectSummary;
  transcripts: TranscriptSummary[];
  runs: RunSummary[];
  worker: WorkerStatus;
  runs_pagination: PageInfo;
}
