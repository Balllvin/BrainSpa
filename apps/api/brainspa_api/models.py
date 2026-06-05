from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


DatasetState = Literal["draft", "validated", "active", "retired", "archived"]
ModelState = Literal["candidate", "active", "failed", "retired", "archived"]
AgentBackend = Literal["codex", "opencode", "grok", "cursor", "hermes"]
LoopStageKey = Literal["evidence", "datasets", "tune", "test"]
JobState = Literal["queued", "running", "complete", "failed", "blocked"]


class ToolStatus(BaseModel):
    key: str
    label: str
    available: bool
    command_path: str | None = None
    version: str | None = None
    setup_hint: str | None = None


class AgentProfile(BaseModel):
    key: str
    label: str
    goal: str
    default_backend: AgentBackend
    allowed_backends: list[AgentBackend]
    validation: list[str]


class HarnessProfile(BaseModel):
    key: LoopStageKey
    label: str
    owner: str
    purpose: str
    default_backend: AgentBackend
    world_state: list[str]
    allowed_actions: list[str]
    tools: list[str]
    scoring_rules: list[str]
    failure_comments: list[str]
    template_artifacts: list[str]


ModelKind = Literal["causal_lm", "policy"]


class ModelProfile(BaseModel):
    key: str
    label: str
    base_model: str = ""
    role: str
    state: ModelState
    parameter_count: str
    hardware_fit: str
    strengths: list[str]
    known_failures: list[str] = Field(default_factory=list)
    model_kind: ModelKind = "causal_lm"
    policy_arch: str | None = None
    input_dim: int | None = None
    output_dim: int | None = None


class DatasetProfile(BaseModel):
    key: str
    label: str
    goal: str
    state: DatasetState
    quality_notes: list[str]
    warnings: list[str] = Field(default_factory=list)
    row_count: int = 0
    artifact_path: str | None = None


class ProjectProfile(BaseModel):
    key: str
    label: str
    goal: str
    active_model: str | None = None
    active_dataset: str | None = None
    environment: str | None = None


class SourceProfile(BaseModel):
    key: str
    label: str
    kind: str
    provenance: str
    summary: str
    active: bool = True
    feeds_models: list[str] = Field(default_factory=list)


EvidenceClaimStatus = Literal["pending", "approved", "rejected", "weak"]


class EvidenceSourceSummary(BaseModel):
    key: str
    label: str
    kind: str
    summary: str
    provenance: str
    feeds_models: list[str] = Field(default_factory=list)
    feeds_model_labels: list[str] = Field(default_factory=list)
    pending_count: int = 0
    approved_count: int = 0
    rejected_count: int = 0
    weak_count: int = 0
    last_ingest_at: str | None = None
    ready_for_datasets: bool = False


class EvidenceClaim(BaseModel):
    id: str
    source_key: str
    source_label: str | None = None
    text: str
    citation: str
    status: EvidenceClaimStatus
    ingested_at: str
    updated_at: str
    ingest_run_id: str | None = None
    manual: bool = False


class EvidenceSourceDetail(BaseModel):
    source: SourceProfile
    behavior_focus: str
    ingest_focus: str | None = None
    last_ingest_at: str | None = None
    claims: list[EvidenceClaim]
    artifact_paths: dict[str, str]


class EvidenceIngestRequest(BaseModel):
    query: str | None = None


class EvidenceIngestResult(BaseModel):
    source_key: str
    ingest_run_id: str
    backend: str
    claims_added: int
    ingested_at: str
    manifest_path: str
    claim_ids: list[str] = Field(default_factory=list)
    ingest_focus: str | None = None


class EvidenceClaimCreate(BaseModel):
    text: str
    citation: str
    source_key: str


class EvidenceClaimPatch(BaseModel):
    status: EvidenceClaimStatus | None = None
    text: str | None = None
    citation: str | None = None
    note: str | None = None


class EvidenceBulkApproveResult(BaseModel):
    approved_count: int
    approved_claim_ids: list[str]
    skipped_without_citation: int


class EvidenceModelSummary(BaseModel):
    model_slug: str
    display_name: str
    behavior_focus: str
    approved_count: int
    pending_count: int
    weak_count: int
    rejected_count: int
    ready_for_datasets: bool
    source_keys: list[str]


class EvidenceManifest(BaseModel):
    version: int
    updated_at: str
    behavior_focus: str
    artifact_dir: str
    sources: dict[str, dict[str, object]]
    models: dict[str, dict[str, object]] = Field(default_factory=dict)
    approved_claim_ids: list[str]
    approved_count: int


class EvidenceApprovedClaimsResponse(BaseModel):
    approved_count: int
    claims: list[EvidenceClaim]
    manifest_path: str
    ready_for_datasets: bool


class EvidenceNotes(BaseModel):
    behavior_focus: str
    sources: dict[str, object]
    notes_path: str


class EnvironmentProfile(BaseModel):
    key: str
    label: str
    goal: str
    harness: str
    scoring: list[str]


class HardwareProfile(BaseModel):
    system: str
    machine: str
    cpu_count: int
    memory_gb: float | None
    recommended_models: list[str]
    notes: list[str]


class LifecycleUpdate(BaseModel):
    state: str


class HermesSetup(BaseModel):
    repository: str
    setup_commands: list[str]
    required_env: list[str]
    brain_spa_bridge: str
    telegram_policy: str


class HermesProviderStatus(BaseModel):
    key: str
    label: str
    auth_kind: str
    configured: bool = False
    active: bool = False
    model: str
    connect_label: str
    blocked_reason: str | None = None
    manual_command: str | None = None


class HermesProviderConnectResult(BaseModel):
    connected: bool
    provider: HermesProviderStatus
    message: str


class TelegramAuthorizationRequest(BaseModel):
    bot_name: str
    chat_id: str
    text: str = ""


class TelegramAuthorizationResult(BaseModel):
    authorized: bool
    reason: str
    routed_to: str | None = None
    reply: str | None = None


class TelegramPollResult(BaseModel):
    updates_seen: int = 0
    messages_sent: int = 0
    feedback_saved: int = 0
    skipped: int = 0
    errors: list[str] = Field(default_factory=list)


class TelegramPollerStatus(BaseModel):
    running: bool
    last_result: TelegramPollResult = Field(default_factory=TelegramPollResult)
    last_error: str | None = None


class DatasetGenerateRequest(BaseModel):
    project_key: str = "believer_validation"
    goal: str = "Create a Believer dataset for SmolLM2 validation."
    example_count: int = Field(default=24, ge=4, le=96)
    scenarios: list[str] = Field(
        default_factory=lambda: ["counsel", "advice", "witness", "daily-word"],
    )
    scenario_weights: dict[str, int] = Field(default_factory=dict)
    mix_even: bool = True
    ground_in_evidence: bool = True
    preview_only: bool = False
    pack: str | None = Field(
        default=None,
        description="Quick pack: witness-heavy | import-feedback-only",
    )


class DatasetRowCreate(BaseModel):
    scenario_key: str
    user_prompt: str
    assistant_answer: str
    failure_labels: list[str] = Field(default_factory=list)
    evidence_claim_ids: list[str] = Field(default_factory=list)


class DatasetPreferencePairCreate(BaseModel):
    prompt: str
    chosen: str
    rejected: str
    failure_labels: list[str] = Field(default_factory=list)
    scenario_key: str = "counsel"


class DatasetEvidenceGate(BaseModel):
    approved_count: int = 0
    ready: bool = False
    manifest_path: str | None = None
    message: str = ""


class DatasetGenerateResult(BaseModel):
    dataset: DatasetProfile
    examples_path: str = ""
    manifest_path: str = ""
    preference_pairs_path: str = ""
    quality: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    evidence_gate: DatasetEvidenceGate | None = None
    preview_only: bool = False
    preview_samples: list["DatasetRow"] = Field(default_factory=list)
    scenario_mix: dict[str, int] = Field(default_factory=dict)
    grounded_in_evidence: bool = False


class DatasetRow(BaseModel):
    id: str
    user_prompt: str
    assistant_answer: str
    scenario_key: str = ""
    failure_labels: list[str] = Field(default_factory=list)
    source: str = "generated"
    metadata: dict[str, Any] = Field(default_factory=dict)


class DatasetRowPatch(BaseModel):
    user_prompt: str | None = None
    assistant_answer: str | None = None
    failure_labels: list[str] | None = None


class DatasetRowPage(BaseModel):
    dataset_key: str
    total: int
    offset: int
    limit: int
    rows: list[DatasetRow]


class DatasetImportFeedbackResult(BaseModel):
    dataset_key: str
    imported_count: int
    skipped_duplicates: int = 0
    pending_feedback_count: int = 0
    message: str = ""


class DatasetPreferencePairResult(BaseModel):
    dataset_key: str
    pair_id: str
    message: str = ""


TrainingPreset = Literal["fast", "standard", "quality"]


class TrainingDryRunRequest(BaseModel):
    project_key: str = "believer_validation"
    dataset_key: str = "believer_seed"
    model_key: str = "persona_small"
    preferred_backend: str | None = None
    training_preset: TrainingPreset = "standard"


class TrainingDryRunResult(BaseModel):
    state: JobState
    backend: str
    model: str
    dataset_key: str
    output_dir: str
    missing_requirements: list[str]
    recipes: list[str]
    notes: list[str]


class TrainingAdapterBuildResult(BaseModel):
    state: JobState
    model: str
    dataset_key: str
    rows_used: int
    steps: int
    loss: float | None
    output_dir: str
    missing_requirements: list[str]
    notes: list[str]
    training_preset: TrainingPreset = "standard"


class EvalRunRequest(BaseModel):
    environment_key: str = "chat_believer"
    prompt: str = "What should I do when I feel spiritually weak?"
    answer: str = "Pray, read Scripture, and ask for help from your church."
    workspace_hint: str | None = None


class EvalComment(BaseModel):
    dimension: str
    verdict: Literal["good", "bad", "mixed"]
    comment: str


class EvalRunResult(BaseModel):
    environment_key: str
    score: float
    passed: bool
    comments: list[EvalComment]
    artifact_path: str


class AdapterTestRequest(BaseModel):
    project_key: str = "believer_validation"
    model_key: str = "persona_small"
    prompt: str = "What should I do when I feel spiritually weak?"


class AdapterTestResult(BaseModel):
    state: JobState
    model: str
    adapter_path: str
    prompt: str
    answer: str
    eval: EvalRunResult | None
    missing_requirements: list[str]
    notes: list[str]


class AcceptanceCase(BaseModel):
    prompt: str
    answer: str
    score: float
    passed: bool
    comments: list[EvalComment]


class AcceptanceRunResult(BaseModel):
    state: JobState
    model: str
    adapter_path: str
    cases: list[AcceptanceCase]
    passed: bool
    missing_requirements: list[str]
    artifact_path: str
    notes: list[str]


class TuneAcceptanceSummary(BaseModel):
    state: str
    passed: bool | None = None
    cases_passed: int = 0
    cases_total: int = 0
    artifact_path: str | None = None


PolicyState = Literal["missing", "training", "ready", "stale", "blocked"]


class TuneModelStatus(BaseModel):
    model_key: str
    slug: str
    label: str
    display_name: str
    project_key: str
    model_kind: ModelKind = "causal_lm"
    adapter_path: str
    adapter_state: Literal["missing", "ready", "blocked", "stale"]
    policy_path: str | None = None
    policy_state: PolicyState | None = None
    dataset_key: str | None = None
    dataset_row_count: int = 0
    build_dataset_key: str | None = None
    build_rows_used: int | None = None
    build_state: str | None = None
    built_at: str | None = None
    stale: bool = False
    stale_reason: str | None = None
    dry_run_state: str | None = None
    missing_requirements: list[str] = Field(default_factory=list)
    acceptance: TuneAcceptanceSummary | None = None


class TuneStatusResponse(BaseModel):
    models: list[TuneModelStatus]


class TuneScenarioCount(BaseModel):
    key: str
    label: str
    count: int


class TuneBuildPreview(BaseModel):
    model_key: str
    slug: str
    dataset_key: str
    dataset_slug: str
    dataset_display_label: str
    row_count: int
    scenario_breakdown: list[TuneScenarioCount]
    adapter_state: Literal["missing", "ready", "blocked", "stale"]
    built_at: str | None = None
    build_rows_used: int | None = None
    stale: bool = False
    stale_reason: str | None = None
    training_preset_default: TrainingPreset = "standard"


class TuneBuildJob(BaseModel):
    state: Literal["idle", "running", "complete", "blocked", "failed"]
    phase: str
    model_key: str
    dataset_key: str
    training_preset: TrainingPreset = "standard"
    result: TrainingAdapterBuildResult | None = None
    error: str | None = None


class WorkerRunRequest(BaseModel):
    agent_key: str
    backend: AgentBackend
    task: str = Field(min_length=3)


class WorkerRunResult(BaseModel):
    state: JobState
    agent_key: str
    backend: AgentBackend
    command_preview: list[str]
    artifacts: list[str]
    logs: list[str]


class ChipmunkChatRequest(BaseModel):
    message: str = Field(min_length=1)


class ChipmunkChatResult(BaseModel):
    reply: str
    routed_to: str
    suggested_actions: list[str]


class ChipmunkTranscribeResult(BaseModel):
    text: str
    engine: str
    notes: list[str] = Field(default_factory=list)


class HarnessChatMessage(BaseModel):
    id: int
    role: Literal["user", "assistant", "system"]
    content: str
    prompt: str | None = None
    model: str | None = None
    adapter_path: str | None = None
    reply_to_message_id: int | None = None
    eval: EvalRunResult | None = None


class HarnessChatThread(BaseModel):
    model_key: str
    scenario_key: str = "counsel"
    messages: list[HarnessChatMessage] = Field(default_factory=list)


class HarnessChatSendRequest(BaseModel):
    model_key: str
    scenario_key: str = "counsel"
    text: str = Field(min_length=1)
    reply_to_message_id: int | None = None


class HarnessChatSendResult(BaseModel):
    kind: Literal["assistant_reply", "feedback_saved"]
    message: HarnessChatMessage
    generation_state: JobState | None = None
    missing_requirements: list[str] = Field(default_factory=list)
    feedback_recorded: bool = False


class TelegramBotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    bot_token: str = Field(min_length=20)
    model_key: str
    allowed_chat_id: str | None = Field(default=None, min_length=1)
    enabled: bool = True


class TelegramBotPublic(BaseModel):
    name: str
    model_key: str
    allowed_chat_id_configured: bool
    enabled: bool
    live_verified: bool = False


class LoopAgentSettings(BaseModel):
    key: LoopStageKey
    label: str
    backend: AgentBackend
    telegram_bot_name: str | None = None
    connected: bool = False


class BackendStatus(BaseModel):
    key: str
    label: str
    installed: bool
    connected: bool
    version: str | None = None
    command_path: str | None = None


class ModelTelegramLink(BaseModel):
    model_key: str
    model_label: str
    model_state: str
    telegram_bot_name: str | None = None


class LoopAgentUpdate(BaseModel):
    backend: AgentBackend | None = None
    telegram_bot_name: str | None = None


class ModelTelegramUpdate(BaseModel):
    telegram_bot_name: str | None = None


class ChipmunkHermesStatus(BaseModel):
    profile: str
    profile_path: str
    config_path: str
    env_path: str
    launch_agent_label: str
    gateway_running: bool = False
    gateway_pid: int | None = None
    gateway_state: str = "unknown"
    gateway_last_exit_code: str | None = None
    provider: str = ""
    model: str = ""
    base_url: str = ""
    reasoning_effort: str = "medium"
    service_tier: str = "normal"
    max_turns: int | None = None
    gateway_timeout: int | None = None
    terminal_cwd: str = ""
    telegram_token_configured: bool = False
    telegram_allowed_users: str | None = None
    telegram_home_channel: str | None = None
    openai_codex_configured: bool = False
    xai_api_key_synced: bool = False
    toolsets: list[str] = Field(default_factory=list)
    telegram_toolsets: list[str] = Field(default_factory=list)
    recent_provider_error: str | None = None


class ChipmunkHermesUpdate(BaseModel):
    provider: str | None = None
    model: str | None = None
    base_url: str | None = None
    reasoning_effort: str | None = None
    service_tier: str | None = None
    max_turns: int | None = None
    gateway_timeout: int | None = None
    telegram_allowed_users: str | None = None
    telegram_home_channel: str | None = None


class ChipmunkSettings(BaseModel):
    default_model_key: str = "persona_small"
    default_telegram_bot_name: str | None = None
    voice_model: str = "grok-voice-think-fast-1.0"
    xai_configured: bool = False
    hermes: ChipmunkHermesStatus | None = None


class ChipmunkSettingsUpdate(BaseModel):
    default_model_key: str | None = None
    default_telegram_bot_name: str | None = None
    voice_model: str | None = None
    hermes: ChipmunkHermesUpdate | None = None
    restart_gateway: bool = False
    xai_api_key: str | None = None
    clear_xai_api_key: bool = False


class AppSettings(BaseModel):
    loop_agents: list[LoopAgentSettings]
    backends: list[BackendStatus]
    model_links: list[ModelTelegramLink]
    telegram_bots: list[TelegramBotPublic]
    hermes_providers: list[HermesProviderStatus] = Field(default_factory=list)
    chipmunk: ChipmunkSettings = Field(default_factory=ChipmunkSettings)


class Overview(BaseModel):
    product_name: str
    local_only: bool
    runtime_root: str
    hardware: HardwareProfile
    tools: list[ToolStatus]
    agents: list[AgentProfile]
    harnesses: list[HarnessProfile]
    projects: list[ProjectProfile]
    sources: list[SourceProfile]
    models: list[ModelProfile]
    datasets: list[DatasetProfile]
    environments: list[EnvironmentProfile]
    telegram_bots: list[TelegramBotPublic]


class SnakeSessionCreate(BaseModel):
    scenario_key: str = "autonomous-watch"
    mode: str = "interactive_watch"
    seed: int | None = None


class SnakeStepRequest(BaseModel):
    session_id: str
    action: str | int | None = None


class PolicyTrainRequest(BaseModel):
    model_key: str = "snake_policy"
    episodes: int = 100
    env_profiles: list[str] = Field(default_factory=lambda: ["solo", "wrapped_v2"])


class PolicyTrainJob(BaseModel):
    state: Literal["idle", "running", "complete", "failed"]
    phase: str = "idle"
    model_key: str = "snake_policy"
    dataset_key: str = "snake_rollout"
    episodes_target: int = 100
    episode: int = 0
    epsilon: float = 1.0
    mean_reward: float = 0.0
    mean_length: float | None = None
    mean_apples: float | None = None
    curriculum_stage: str | None = None
    last_outcome: str | None = None
    error: str | None = None


class PolicyEvalRequest(BaseModel):
    model_key: str = "snake_policy"
    episodes: int = 100
    scenario_key: str = "autonomous-watch"


class PolicyEvalResult(BaseModel):
    episodes: int
    mean_length: float
    mean_apples: float
    mean_coverage: float
    full_board_count: int
    full_board_rate: float
    consecutive_full_board_max: int
    death_breakdown: dict[str, int]
    oracle_agreement_rate: float
    passed: bool
    north_star: str
    artifact_path: str


class SnakeDatasetSummary(BaseModel):
    dataset_key: str
    trajectory_count: int
    transition_count: int
    manifest_path: str
    trajectories_path: str
    transitions_path: str
