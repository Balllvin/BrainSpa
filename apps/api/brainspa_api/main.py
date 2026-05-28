from __future__ import annotations

import os
import platform
import subprocess
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import ensure_runtime_dirs, runtime_root
from .models import (
    AdapterTestRequest,
    AdapterTestResult,
    AppSettings,
    ChipmunkChatRequest,
    ChipmunkChatResult,
    ChipmunkSettings,
    ChipmunkSettingsUpdate,
    ChipmunkTranscribeResult,
    DatasetGenerateRequest,
    DatasetGenerateResult,
    DatasetProfile,
    EvalRunRequest,
    EvalRunResult,
    HardwareProfile,
    HermesSetup,
    LifecycleUpdate,
    LoopAgentSettings,
    LoopAgentUpdate,
    ModelProfile,
    ModelTelegramLink,
    ModelTelegramUpdate,
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
from .backend_connect import connect_backend_stream
from .chipmunk_voice import create_voice_client_secret
from .settings_store import (
    CONNECTABLE_BACKENDS,
    backend_is_connected,
    build_app_settings,
    mark_backend_authenticated,
    update_chipmunk_settings,
    update_loop_agent,
    update_model_telegram,
)
from .state import (
    BrainSpaState,
    add_telegram_bot,
    authorize_telegram_message,
    event_log_exists,
    migrate_legacy_telegram_bots,
    read_telegram_bots,
    set_xai_api_key,
    clear_xai_api_key,
)
from .tools import detect_tools
from .transcribe import transcribe_audio_bytes
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

    @app.post("/api/telegram/import-legacy")
    def import_legacy_telegram() -> dict[str, int]:
        count = migrate_legacy_telegram_bots()
        return {"imported": count}

    @app.get("/api/settings", response_model=AppSettings)
    def read_settings() -> AppSettings:
        models = [model.model_dump() for model in state.models()]
        bots = [bot.model_dump() for bot in read_telegram_bots()]
        payload = build_app_settings(models, bots)
        return AppSettings(**payload)

    @app.patch("/api/settings/loop/{stage_key}", response_model=LoopAgentSettings)
    def patch_loop_agent(stage_key: str, update: LoopAgentUpdate) -> LoopAgentSettings:
        fields = update.model_dump(exclude_unset=True)
        try:
            agent = update_loop_agent(
                stage_key,
                update.backend,
                update.telegram_bot_name,
                clear_telegram="telegram_bot_name" in fields,
            )
        except KeyError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        data = agent.model_dump()
        data.pop("connected", None)
        return LoopAgentSettings(**data, connected=backend_is_connected(agent.backend))

    @app.patch("/api/settings/models/{model_key}/telegram", response_model=ModelTelegramLink)
    def patch_model_telegram(model_key: str, update: ModelTelegramUpdate) -> ModelTelegramLink:
        label = model_key
        model_state = "candidate"
        for model in state.models():
            if model.key == model_key:
                label = model.label
                model_state = model.state
                break
        return update_model_telegram(model_key, update.telegram_bot_name, label, model_state)

    @app.patch("/api/settings/chipmunk", response_model=ChipmunkSettings)
    def patch_chipmunk_settings(update: ChipmunkSettingsUpdate) -> ChipmunkSettings:
        if update.clear_xai_api_key:
            clear_xai_api_key()
        if update.xai_api_key:
            set_xai_api_key(update.xai_api_key)
        patch = update.model_dump(exclude_unset=True, exclude={"xai_api_key", "clear_xai_api_key"})
        data = update_chipmunk_settings(patch)
        return ChipmunkSettings(**data)

    @app.post("/api/chipmunk/voice/client-secret")
    def chipmunk_voice_client_secret() -> dict[str, object]:
        return create_voice_client_secret()

    @app.post("/api/backends/{backend_key}/connect")
    def backend_connect(backend_key: str) -> dict[str, object]:
        from .settings_store import probe_backend_ready

        if backend_key not in CONNECTABLE_BACKENDS:
            raise HTTPException(status_code=404, detail=f"Unknown backend: {backend_key}")
        if backend_key == "hermes":
            mark_backend_authenticated("hermes", probe_backend_ready("hermes"))
            return {"ok": True, "connected": probe_backend_ready("hermes"), "installed": probe_backend_ready("hermes")}
        if probe_backend_ready(backend_key):
            mark_backend_authenticated(backend_key, True)
            return {"ok": True, "connected": True, "installed": True, "needs_stream": False}
        if backend_key == "cursor":
            return {
                "ok": True,
                "connected": False,
                "installed": False,
                "needs_stream": False,
                "manual": True,
            }
        return {"ok": True, "connected": False, "installed": False, "needs_stream": True}

    @app.get("/api/backends/{backend_key}/connect/stream")
    def backend_connect_stream(backend_key: str) -> StreamingResponse:
        if backend_key not in CONNECTABLE_BACKENDS:
            raise HTTPException(status_code=404, detail=f"Unknown backend: {backend_key}")
        if backend_key == "hermes":
            raise HTTPException(status_code=400, detail="Hermes does not use the install stream.")
        return StreamingResponse(connect_backend_stream(backend_key), media_type="text/event-stream")

    @app.post("/api/backends/{backend_key}/auth/complete")
    def backend_auth_complete(backend_key: str) -> dict[str, bool]:
        if backend_key not in CONNECTABLE_BACKENDS:
            raise HTTPException(status_code=404, detail=f"Unknown backend: {backend_key}")
        mark_backend_authenticated(backend_key, True)
        return {"ok": True}

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

    @app.post("/api/chipmunk/transcribe", response_model=ChipmunkTranscribeResult)
    async def transcribe_for_chipmunk(audio: UploadFile = File(...)) -> ChipmunkTranscribeResult:
        payload = await audio.read()
        if not payload:
            raise HTTPException(status_code=400, detail="Empty audio upload")
        if len(payload) > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Audio file too large (max 25MB)")

        suffix = Path(audio.filename or "note.webm").suffix or ".webm"
        try:
            text, notes = transcribe_audio_bytes(payload, suffix=suffix)
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error

        engine = "faster-whisper" if any("faster-whisper" in note for note in notes) else "local-stt"
        return ChipmunkTranscribeResult(text=text, engine=engine, notes=notes)

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
