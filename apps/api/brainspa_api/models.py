from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


DatasetState = Literal["draft", "validated", "active", "retired", "archived"]
ModelState = Literal["candidate", "active", "failed", "retired", "archived"]
AgentBackend = Literal["codex", "opencode", "grok", "cursor", "hermes"]
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


class ModelProfile(BaseModel):
    key: str
    label: str
    base_model: str
    role: str
    state: ModelState
    parameter_count: str
    hardware_fit: str
    strengths: list[str]
    known_failures: list[str] = Field(default_factory=list)


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


class TelegramAuthorizationRequest(BaseModel):
    bot_name: str
    chat_id: str
    text: str = ""


class TelegramAuthorizationResult(BaseModel):
    authorized: bool
    reason: str
    routed_to: str | None = None
    reply: str | None = None


class DatasetGenerateRequest(BaseModel):
    project_key: str = "believer_validation"
    goal: str = "Create a Believer dataset for SmolLM2 validation."
    example_count: int = Field(default=100, ge=5, le=200)


class DatasetGenerateResult(BaseModel):
    dataset: DatasetProfile
    examples_path: str
    manifest_path: str
    preference_pairs_path: str
    quality: list[str]
    warnings: list[str]


class TrainingDryRunRequest(BaseModel):
    project_key: str = "believer_validation"
    dataset_key: str = "believer_seed"
    model_key: str = "persona_small"
    preferred_backend: str | None = None


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


class EvalRunRequest(BaseModel):
    environment_key: str = "chat_believer"
    prompt: str = "What should I do when I feel spiritually weak?"
    answer: str = "Pray, read Scripture, and ask for help from your church."
    fen: str | None = None


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


class Overview(BaseModel):
    product_name: str
    local_only: bool
    runtime_root: str
    hardware: HardwareProfile
    tools: list[ToolStatus]
    agents: list[AgentProfile]
    projects: list[ProjectProfile]
    sources: list[SourceProfile]
    models: list[ModelProfile]
    datasets: list[DatasetProfile]
    environments: list[EnvironmentProfile]
    telegram_bots: list[TelegramBotPublic]
