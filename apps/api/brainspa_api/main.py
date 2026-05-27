from __future__ import annotations

import os
import platform
import subprocess

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import ensure_runtime_dirs, runtime_root
from .models import (
    AdapterTestRequest,
    AdapterTestResult,
    ChipmunkChatRequest,
    ChipmunkChatResult,
    DatasetGenerateRequest,
    DatasetGenerateResult,
    DatasetProfile,
    EvalRunRequest,
    EvalRunResult,
    HardwareProfile,
    HermesSetup,
    LifecycleUpdate,
    ModelProfile,
    Overview,
    TelegramBotCreate,
    TelegramAuthorizationRequest,
    TelegramAuthorizationResult,
    TelegramBotPublic,
    TrainingDryRunRequest,
    TrainingDryRunResult,
    TrainingAdapterBuildResult,
    WorkerRunRequest,
    WorkerRunResult,
)
from .state import BrainSpaState, add_telegram_bot, authorize_telegram_message, event_log_exists, read_telegram_bots
from .tools import detect_tools
from .workflows import (
    chipmunk_reply,
    generate_believer_dataset,
    test_training_adapter,
    run_environment_eval,
    run_worker_job,
    build_training_adapter,
    training_dry_run,
)


def create_app() -> FastAPI:
    ensure_runtime_dirs()
    app = FastAPI(title="Brain Spa Local API")
    state = BrainSpaState()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict[str, object]:
        tools = detect_tools()
        return {
            "ok": True,
            "product_name": "Brain Spa",
            "local_only": True,
            "runtime_root": str(runtime_root()),
            "tools_available": sum(1 for tool in tools if tool.available),
            "tools_total": len(tools),
        }

    @app.get("/api/overview", response_model=Overview)
    def overview() -> Overview:
        return Overview(
            product_name="Brain Spa",
            local_only=True,
            runtime_root=str(runtime_root()),
            hardware=hardware_profile(),
            tools=detect_tools(),
            agents=state.agents(),
            projects=state.projects(),
            sources=state.sources(),
            models=state.models(),
            datasets=state.datasets(),
            environments=state.environments(),
            telegram_bots=read_telegram_bots(),
        )

    @app.get("/api/tools")
    def tools() -> list[dict[str, object]]:
        return [tool.model_dump() for tool in detect_tools()]

    @app.get("/api/hardware", response_model=HardwareProfile)
    def hardware() -> HardwareProfile:
        return hardware_profile()

    @app.get("/api/hermes/setup", response_model=HermesSetup)
    def hermes_setup() -> HermesSetup:
        return HermesSetup(
            repository="https://github.com/NousResearch/hermes-agent",
            setup_commands=[
                "git clone https://github.com/NousResearch/hermes-agent.git Retired/reference/hermes-agent",
                "hermes --help",
                "npm run api",
            ],
            required_env=["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_CHAT_ID", "BRAIN_SPA_HOME"],
            brain_spa_bridge="Use Brain Spa's local API as the tool bridge; tokens stay in the backend runtime secret file.",
            telegram_policy="Only the configured allowed chat ID may route messages to Chipmunk.",
        )

    @app.get("/api/telegram/bots", response_model=list[TelegramBotPublic])
    def telegram_bots() -> list[TelegramBotPublic]:
        return read_telegram_bots()

    @app.post("/api/telegram/bots", response_model=TelegramBotPublic)
    def create_telegram_bot(bot: TelegramBotCreate) -> TelegramBotPublic:
        return add_telegram_bot(bot)

    @app.post("/api/telegram/authorize", response_model=TelegramAuthorizationResult)
    def authorize_telegram(request: TelegramAuthorizationRequest) -> TelegramAuthorizationResult:
        authorized, reason = authorize_telegram_message(request.bot_name, request.chat_id)
        if not authorized:
            return TelegramAuthorizationResult(authorized=False, reason=reason)
        route = chipmunk_reply(request.text or "telegram route check")
        return TelegramAuthorizationResult(
            authorized=True,
            reason=reason,
            routed_to=route.routed_to,
            reply=route.reply,
        )

    @app.post("/api/datasets/{dataset_key}/state", response_model=DatasetProfile)
    def update_dataset_state(dataset_key: str, update: LifecycleUpdate) -> DatasetProfile:
        try:
            dataset = state.update_dataset_state(dataset_key, update.state)
        except (KeyError, ValueError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        event_log_exists()
        return DatasetProfile(**dataset)

    @app.post("/api/models/{model_key}/state", response_model=ModelProfile)
    def update_model_state(model_key: str, update: LifecycleUpdate) -> ModelProfile:
        try:
            model = state.update_model_state(model_key, update.state)
        except (KeyError, ValueError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return ModelProfile(**model)

    @app.post("/api/datasets/generate", response_model=DatasetGenerateResult)
    def generate_dataset(request: DatasetGenerateRequest) -> DatasetGenerateResult:
        return generate_believer_dataset(request)

    @app.post("/api/training/dry-run", response_model=TrainingDryRunResult)
    def dry_run_training(request: TrainingDryRunRequest) -> TrainingDryRunResult:
        return training_dry_run(request)

    @app.post("/api/training/build-adapter", response_model=TrainingAdapterBuildResult)
    def build_adapter(request: TrainingDryRunRequest) -> TrainingAdapterBuildResult:
        return build_training_adapter(request)

    @app.post("/api/training/test-adapter", response_model=AdapterTestResult)
    def test_adapter(request: AdapterTestRequest) -> AdapterTestResult:
        return test_training_adapter(request)

    @app.post("/api/evals/run", response_model=EvalRunResult)
    def run_eval(request: EvalRunRequest) -> EvalRunResult:
        return run_environment_eval(request)

    @app.post("/api/workers/run", response_model=WorkerRunResult)
    def run_worker(request: WorkerRunRequest) -> WorkerRunResult:
        return run_worker_job(request)

    @app.post("/api/chipmunk/chat", response_model=ChipmunkChatResult)
    def chat_with_chipmunk(request: ChipmunkChatRequest) -> ChipmunkChatResult:
        return chipmunk_reply(request.message)

    return app


def hardware_profile() -> HardwareProfile:
    memory_gb = _memory_gb()
    recommended = ["HuggingFaceTB/SmolLM2-360M-Instruct", "Qwen/Qwen2.5-Coder-0.5B-Instruct"]
    notes = [
        "Small models stay first because the current target is local macOS.",
        "Use larger models only when hardware and runtime checks prove they fit.",
    ]
    if memory_gb is not None and memory_gb < 12:
        notes.append("Memory profile favors sub-700M parameter experiments.")
    return HardwareProfile(
        system=platform.system(),
        machine=platform.machine(),
        cpu_count=os.cpu_count() or 1,
        memory_gb=memory_gb,
        recommended_models=recommended,
        notes=notes,
    )


def _memory_gb() -> float | None:
    if platform.system() == "Darwin":
        try:
            output = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True, timeout=1).strip()
            return round(int(output) / (1024**3), 1)
        except (OSError, subprocess.SubprocessError, ValueError):
            return None
    return None
