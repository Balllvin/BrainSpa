from __future__ import annotations

import json
import os
import platform
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path
from collections.abc import AsyncIterator

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
    DatasetEvidenceGate,
    DatasetImportFeedbackResult,
    DatasetRow,
    DatasetRowPage,
    DatasetRowCreate,
    DatasetRowPatch,
    DatasetPreferencePairCreate,
    DatasetPreferencePairResult,
    EvalRunRequest,
    EvalRunResult,
    HardwareProfile,
    HarnessProfile,
    HermesSetup,
    HermesProviderConnectResult,
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
    TelegramPollResult,
    TelegramPollerStatus,
    TrainingDryRunRequest,
    TrainingDryRunResult,
    TrainingAdapterBuildResult,
    TuneBuildJob,
    TuneBuildPreview,
    TuneModelStatus,
    TuneStatusResponse,
    SnakeSessionCreate,
    SnakeStepRequest,
    SnakeLabEpisodesRequest,
    SnakeLabSpeedRequest,
    SnakeLabStartRequest,
    PolicyTrainRequest,
    PolicyTrainJob,
    PolicyEvalRequest,
    PolicyEvalResult,
    SnakeDatasetSummary,
    WorkerRunRequest,
    WorkerRunResult,
    HarnessChatSendRequest,
    HarnessChatSendResult,
    HarnessChatThread,
    EvidenceApprovedClaimsResponse,
    EvidenceBulkApproveResult,
    EvidenceClaim,
    EvidenceClaimCreate,
    EvidenceClaimPatch,
    EvidenceIngestRequest,
    EvidenceIngestResult,
    EvidenceManifest,
    EvidenceModelSummary,
    EvidenceNotes,
    EvidenceSourceDetail,
    EvidenceSourceSummary,
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
    get_xai_api_key,
    telegram_bot_model_key,
)
from .tools import detect_tools
from .transcribe import transcribe_audio_bytes
from .harness_chat import read_harness_chat, send_harness_chat
from .evidence_store import (
    bulk_approve_pending_with_citation,
    create_evidence_claim,
    delete_evidence_claim,
    get_evidence_source_detail,
    get_model_evidence_summary,
    list_approved_claims,
    list_evidence_claims,
    list_evidence_sources,
    list_source_claims,
    patch_evidence_claim,
    read_evidence_manifest,
    read_evidence_notes,
    start_source_ingest,
)
from .test_scenarios import TestScenarioPublic, list_test_scenarios
from .hermes_provider import connect_hermes_provider
from .telegram_runtime import TelegramPoller
from .datasets_workflows import (
    add_manual_preference_pair,
    create_dataset_row,
    delete_dataset_row,
    import_test_feedback,
    list_dataset_rows,
    patch_dataset_row,
    read_evidence_gate,
)
from .tune_api import list_tune_status, tune_build_preview, tune_status_for_slug
from .tune_build import read_build_job_for_slug, start_build_job
from .snake_api import (
    close_session,
    coach_diff_for_session,
    coach_step_replay,
    create_session,
    get_session,
    step_session,
)
from .snake_session_store import list_archived_sessions
from .snake_policy_reset import reset_snake_policy
from .snake_train_lab import (
    read_snake_lab,
    set_snake_lab_episodes,
    set_snake_lab_speed,
    start_snake_lab,
    stop_snake_lab,
    tick_snake_lab,
)
from .policy_train import read_policy_train_job, request_stop_training, start_policy_train
from packages.brainspa_training.snake_lab import get_snake_train_lab
from .policy_eval import run_policy_eval
from .policy_datasets import read_snake_dataset_summary, list_transitions, SNAKE_DATASET_KEY

from .workflows import (
    chipmunk_reply,
    test_training_adapter,
    run_environment_eval,
    run_worker_job,
    build_training_adapter,
    training_dry_run,
    looks_like_loop_request,
)
from .ml_api import router as ml_router
from .agents_api import router as agents_router


def create_app() -> FastAPI:
    ensure_runtime_dirs()
    state = BrainSpaState()
    telegram_poller = TelegramPoller()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if os.environ.get("BRAIN_SPA_DISABLE_TELEGRAM_POLLING") != "1":
            telegram_poller.start()
        try:
            yield
        finally:
            telegram_poller.stop()

    app = FastAPI(title="Brain Spa Local API", lifespan=lifespan)

    cors_raw = os.environ.get(
        "BRAIN_SPA_CORS_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://127.0.0.1:5174,http://localhost:5174,"
        "http://127.0.0.1:5175,http://localhost:5175",
    )
    cors_origins = [origin.strip() for origin in cors_raw.split(",") if origin.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
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
            harnesses=state.harnesses(),
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

    @app.post("/api/hermes/providers/{provider_key}/connect", response_model=HermesProviderConnectResult)
    def hermes_provider_connect(provider_key: str) -> HermesProviderConnectResult:
        try:
            return connect_hermes_provider(provider_key)
        except KeyError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error

    @app.get("/api/telegram/bots", response_model=list[TelegramBotPublic])
    def telegram_bots() -> list[TelegramBotPublic]:
        return read_telegram_bots()

    @app.post("/api/telegram/bots", response_model=TelegramBotPublic)
    def create_telegram_bot(bot: TelegramBotCreate) -> TelegramBotPublic:
        if bot.name.strip().lower() == "chipmunk":
            raise HTTPException(
                status_code=400,
                detail="Chipmunk Telegram is reserved for the official Hermes gateway. Configure it on Settings -> Chipmunk.",
            )
        return add_telegram_bot(bot)

    @app.post("/api/telegram/import-legacy")
    def import_legacy_telegram() -> dict[str, int]:
        count = migrate_legacy_telegram_bots()
        return {"imported": count}

    @app.get("/api/telegram/poller/status", response_model=TelegramPollerStatus)
    def telegram_poller_status() -> TelegramPollerStatus:
        return telegram_poller.status()

    @app.post("/api/telegram/poller/start", response_model=TelegramPollerStatus)
    def telegram_poller_start() -> TelegramPollerStatus:
        telegram_poller.start()
        return telegram_poller.status()

    @app.post("/api/telegram/poller/stop", response_model=TelegramPollerStatus)
    def telegram_poller_stop() -> TelegramPollerStatus:
        telegram_poller.stop()
        return telegram_poller.status()

    @app.post("/api/telegram/poller/poll-once", response_model=TelegramPollResult)
    def telegram_poller_poll_once() -> TelegramPollResult:
        return telegram_poller.poll_once(timeout=0)

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
        if update.clear_xai_api_key or update.xai_api_key:
            from .chipmunk_hermes import sync_chipmunk_xai_key

            sync_chipmunk_xai_key(get_xai_api_key())
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
        if request.bot_name.strip().lower() == "chipmunk":
            return TelegramAuthorizationResult(
                authorized=False,
                reason="Chipmunk Telegram is handled by the official Hermes gateway, not the Brain Spa model-bot worker.",
            )
        authorized, reason = authorize_telegram_message(request.bot_name, request.chat_id)
        if not authorized:
            return TelegramAuthorizationResult(authorized=False, reason=reason)
        model_key = telegram_bot_model_key(request.bot_name)
        if model_key and request.bot_name != "chipmunk" and not looks_like_loop_request(request.text):
            return TelegramAuthorizationResult(
                authorized=True,
                reason=reason,
                routed_to="test" if model_key == "snake_policy" else "chipmunk",
                reply=(
                    "Snake Policy is an environment policy, not a shipped chat model. "
                    "Use the Snake Test pages to run or train it."
                ),
            )
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
        raise HTTPException(
            status_code=400,
            detail="No default text dataset is shipped. Use /test/snake/autonomous-train to create Snake rollout data.",
        )

    @app.get("/api/datasets/evidence-gate", response_model=DatasetEvidenceGate)
    def datasets_evidence_gate() -> DatasetEvidenceGate:
        return read_evidence_gate()

    @app.get("/api/datasets/scenarios", response_model=list[TestScenarioPublic])
    def datasets_scenarios() -> list[TestScenarioPublic]:
        return list_test_scenarios("snake_policy")

    @app.get("/api/datasets/{dataset_key}/rows", response_model=DatasetRowPage)
    def dataset_rows(dataset_key: str, offset: int = 0, limit: int = 50) -> DatasetRowPage:
        return list_dataset_rows(dataset_key, offset=offset, limit=limit)

    @app.patch("/api/datasets/{dataset_key}/rows/{row_id}", response_model=DatasetRow)
    def dataset_row_patch(dataset_key: str, row_id: str, patch: DatasetRowPatch) -> DatasetRow:
        return patch_dataset_row(dataset_key, row_id, patch)

    @app.delete("/api/datasets/{dataset_key}/rows/{row_id}")
    def dataset_row_delete(dataset_key: str, row_id: str) -> dict[str, bool]:
        delete_dataset_row(dataset_key, row_id)
        return {"ok": True}

    @app.post("/api/datasets/{dataset_key}/generate", response_model=DatasetGenerateResult)
    def generate_dataset_by_key(dataset_key: str, request: DatasetGenerateRequest) -> DatasetGenerateResult:
        if dataset_key in {"snake", SNAKE_DATASET_KEY}:
            raise HTTPException(
                status_code=400,
                detail="Snake rollout data is created by autonomous train, not by text row generation.",
            )
        raise HTTPException(status_code=404, detail=f"Unknown dataset: {dataset_key}")

    @app.post("/api/datasets/{dataset_key}/import-test-feedback", response_model=DatasetImportFeedbackResult)
    def dataset_import_test_feedback(dataset_key: str) -> DatasetImportFeedbackResult:
        return import_test_feedback(dataset_key)

    @app.post("/api/datasets/{dataset_key}/rows", response_model=DatasetRow)
    def dataset_row_create(dataset_key: str, body: DatasetRowCreate) -> DatasetRow:
        return create_dataset_row(dataset_key, body)

    @app.post("/api/datasets/{dataset_key}/preference-pairs", response_model=DatasetPreferencePairResult)
    def dataset_preference_pair_create(
        dataset_key: str,
        body: DatasetPreferencePairCreate,
    ) -> DatasetPreferencePairResult:
        return add_manual_preference_pair(dataset_key, body)

    @app.get("/api/tune/status", response_model=TuneStatusResponse)
    def tune_status_overview() -> TuneStatusResponse:
        return list_tune_status()

    @app.get("/api/tune/{model_slug}/status", response_model=TuneModelStatus)
    def tune_model_status(model_slug: str) -> TuneModelStatus:
        try:
            return tune_status_for_slug(model_slug)
        except KeyError as error:
            raise HTTPException(status_code=404, detail=f"Unknown tune model: {model_slug}") from error

    @app.post("/api/tune/dry-run", response_model=TrainingDryRunResult)
    def tune_dry_run(request: TrainingDryRunRequest) -> TrainingDryRunResult:
        return training_dry_run(request)

    @app.get("/api/tune/{model_slug}/build-preview", response_model=TuneBuildPreview)
    def tune_build_preview_route(model_slug: str, dataset_key: str | None = None) -> TuneBuildPreview:
        try:
            return tune_build_preview(model_slug, dataset_key)
        except KeyError as error:
            raise HTTPException(status_code=404, detail=f"Unknown tune model: {model_slug}") from error

    @app.get("/api/tune/{model_slug}/build-job", response_model=TuneBuildJob)
    def tune_build_job_route(model_slug: str) -> TuneBuildJob:
        job = read_build_job_for_slug(model_slug)
        if not job:
            return TuneBuildJob(
                state="idle",
                phase="idle",
                model_key="",
                dataset_key="",
            )
        return job

    @app.post("/api/tune/build", response_model=TuneBuildJob)
    def tune_build(request: TrainingDryRunRequest) -> TuneBuildJob:
        return start_build_job(request)

    @app.post("/api/tune/test-adapter", response_model=AdapterTestResult)
    def tune_test_adapter(request: AdapterTestRequest) -> AdapterTestResult:
        return test_training_adapter(request)

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

    @app.post("/api/env/snake/session")
    def snake_create_session(body: SnakeSessionCreate) -> dict:
        return create_session(scenario_key=body.scenario_key, mode=body.mode, seed=body.seed)

    @app.get("/api/env/snake/session/{session_id}")
    def snake_get_session(session_id: str) -> dict:
        try:
            return get_session(session_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Unknown snake session") from error

    @app.post("/api/env/snake/step")
    def snake_step(body: SnakeStepRequest) -> dict:
        try:
            return step_session(body.session_id, body.action, actor=getattr(body, "actor", "auto"))
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Unknown snake session") from error

    @app.post("/api/env/snake/session/{session_id}/close")
    def snake_close_session(session_id: str) -> dict:
        return close_session(session_id)

    @app.get("/api/env/snake/sessions/archived")
    def snake_archived_sessions() -> list[dict]:
        return list_archived_sessions()

    @app.post("/api/env/snake/lab/start")
    def snake_lab_start(body: SnakeLabStartRequest) -> dict:
        return start_snake_lab(
            slots=body.slots,
            episodes=body.episodes,
            pace=body.pace,
            speed_multiplier=body.speed_multiplier,
        )

    @app.post("/api/env/snake/lab/speed")
    def snake_lab_speed(body: SnakeLabSpeedRequest) -> dict:
        return set_snake_lab_speed(body.speed_multiplier)

    @app.post("/api/env/snake/lab/episodes")
    def snake_lab_episodes(body: SnakeLabEpisodesRequest) -> dict:
        return set_snake_lab_episodes(body.episodes)

    @app.post("/api/env/snake/reset")
    def snake_policy_reset() -> dict:
        from .snake_train_lab import with_career_records

        result = reset_snake_policy()
        result["lab"] = with_career_records(result["lab"])
        return result

    @app.post("/api/env/snake/lab/stop")
    def snake_lab_stop() -> dict:
        return stop_snake_lab()

    @app.get("/api/env/snake/lab")
    def snake_lab_status() -> dict:
        return read_snake_lab()

    @app.get("/api/env/snake/performance")
    def snake_policy_performance() -> dict:
        from .policy_performance import read_policy_performance

        return read_policy_performance()

    @app.post("/api/env/snake/lab/tick")
    def snake_lab_tick() -> dict:
        return tick_snake_lab()

    @app.get("/api/env/snake/lab/stream")
    def snake_lab_stream():
        import asyncio

        async def event_stream():
            from .snake_train_lab import reconcile_lab_train_job, tick_snake_lab

            lab = get_snake_train_lab()
            while lab.running:
                frame = tick_snake_lab()
                payload = json.dumps({"type": "frame", "lab": frame})
                yield f"data: {payload}\n\n"
                if not lab.running:
                    break
                await asyncio.sleep(lab.stream_interval_sec())
            reconcile_lab_train_job()
            from .snake_train_lab import read_snake_lab

            done = read_snake_lab()
            yield f"data: {json.dumps({'type': 'done', 'lab': done})}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.get("/api/env/snake/coach/{session_id}")
    def snake_coach(session_id: str, step: int | None = None) -> dict:
        if step is not None:
            return coach_step_replay(session_id, step)
        return coach_diff_for_session(session_id)

    @app.get("/api/env/snake/coach/{session_id}/diff")
    def snake_coach_diff(session_id: str, step: int | None = None) -> dict:
        return coach_diff_for_session(session_id, step=step)

    @app.post("/api/policy/train", response_model=PolicyTrainJob)
    def policy_train(body: PolicyTrainRequest) -> PolicyTrainJob:
        payload = start_policy_train(
            episodes=body.episodes,
            env_profiles=body.env_profiles,
            policy_backend=body.policy_backend,
        )
        return PolicyTrainJob(**{k: v for k, v in payload.items() if k in PolicyTrainJob.model_fields})

    @app.post("/api/policy/train/stop")
    def policy_train_stop() -> dict[str, bool]:
        request_stop_training()
        return {"stopped": True}

    @app.get("/api/policy/{model_slug}/train-job", response_model=PolicyTrainJob)
    def policy_train_job(model_slug: str) -> PolicyTrainJob:
        from .snake_train_lab import reconcile_lab_train_job

        job = reconcile_lab_train_job() or read_policy_train_job()
        if not job:
            return PolicyTrainJob(state="idle", phase="idle")
        return PolicyTrainJob(**{k: v for k, v in job.items() if k in PolicyTrainJob.model_fields})

    @app.get("/api/policy/{model_slug}/train-stream")
    def policy_train_stream(model_slug: str):
        import asyncio
        import time

        async def event_stream():
            last_episode = -1
            while True:
                job = read_policy_train_job() or {}
                episode = int(job.get("episode") or 0)
                if episode != last_episode:
                    last_episode = episode
                    payload = json.dumps({"type": "progress", "job": job})
                    yield f"data: {payload}\n\n"
                if job.get("state") in {"complete", "failed", "idle"}:
                    yield f"data: {json.dumps({'type': 'done', 'job': job})}\n\n"
                    break
                await asyncio.sleep(0.5)

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.post("/api/policy/{model_slug}/eval", response_model=PolicyEvalResult)
    def policy_eval_route(model_slug: str, body: PolicyEvalRequest) -> PolicyEvalResult:
        result = run_policy_eval(episodes=body.episodes, scenario_key=body.scenario_key)
        return PolicyEvalResult(**result)

    @app.get("/api/policy/{model_slug}/eval/latest", response_model=PolicyEvalResult | None)
    def policy_eval_latest(model_slug: str) -> PolicyEvalResult | None:
        from .policy_paths import snake_acceptance_path

        path = snake_acceptance_path()
        if not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        return PolicyEvalResult(**payload)

    @app.get("/api/policy/{model_slug}/performance")
    def policy_performance_route(model_slug: str) -> dict:
        if model_slug not in {"snake", "snake_policy"}:
            raise HTTPException(status_code=404, detail="Performance tracking is only available for snake policy")
        from .policy_performance import read_policy_performance

        return read_policy_performance()

    @app.get("/api/datasets/{dataset_key}/policy-summary", response_model=SnakeDatasetSummary)
    def snake_dataset_summary(dataset_key: str) -> SnakeDatasetSummary:
        if dataset_key != SNAKE_DATASET_KEY and dataset_key != "snake":
            raise HTTPException(status_code=404, detail="Not a policy dataset")
        summary = read_snake_dataset_summary(SNAKE_DATASET_KEY)
        return SnakeDatasetSummary(**summary)

    @app.get("/api/datasets/{dataset_key}/transitions")
    def snake_dataset_transitions(dataset_key: str, limit: int = 50, offset: int = 0) -> dict:
        if dataset_key not in {SNAKE_DATASET_KEY, "snake"}:
            raise HTTPException(status_code=404, detail="Not a policy dataset")
        return list_transitions(SNAKE_DATASET_KEY, limit=limit, offset=offset)

    @app.get("/api/evidence/sources", response_model=list[EvidenceSourceSummary])
    def evidence_sources() -> list[EvidenceSourceSummary]:
        return list_evidence_sources(state)

    @app.get("/api/evidence/models/{model_slug}", response_model=EvidenceModelSummary)
    def evidence_model_summary(model_slug: str) -> EvidenceModelSummary:
        return get_model_evidence_summary(state, model_slug)

    @app.get("/api/evidence/sources/{source_key}", response_model=EvidenceSourceDetail)
    def evidence_source_detail(source_key: str) -> EvidenceSourceDetail:
        return get_evidence_source_detail(state, source_key)

    @app.get("/api/evidence/sources/{source_key}/claims", response_model=list[EvidenceClaim])
    def evidence_source_claims(source_key: str) -> list[EvidenceClaim]:
        return list_source_claims(state, source_key)

    @app.get("/api/evidence/claims", response_model=list[EvidenceClaim])
    def evidence_claims(
        model: str | None = None,
        status: str | None = None,
        source_key: str | None = None,
    ) -> list[EvidenceClaim]:
        return list_evidence_claims(state, model=model, status=status, source_key=source_key)

    @app.post("/api/evidence/claims", response_model=EvidenceClaim)
    def evidence_claim_create(body: EvidenceClaimCreate) -> EvidenceClaim:
        return create_evidence_claim(state, body)

    @app.post("/api/evidence/sources/{source_key}/ingest", response_model=EvidenceIngestResult)
    def evidence_source_ingest(source_key: str, request: EvidenceIngestRequest) -> EvidenceIngestResult:
        return start_source_ingest(state, source_key, request)

    @app.patch("/api/evidence/claims/{claim_id}", response_model=EvidenceClaim)
    def evidence_claim_patch(claim_id: str, patch: EvidenceClaimPatch) -> EvidenceClaim:
        return patch_evidence_claim(state, claim_id, patch)

    @app.delete("/api/evidence/claims/{claim_id}")
    def evidence_claim_delete(claim_id: str) -> dict[str, bool]:
        return delete_evidence_claim(state, claim_id)

    @app.post("/api/evidence/claims/bulk-approve", response_model=EvidenceBulkApproveResult)
    def evidence_claims_bulk_approve(model: str | None = None) -> EvidenceBulkApproveResult:
        return bulk_approve_pending_with_citation(state, model)

    @app.get("/api/evidence/manifest", response_model=EvidenceManifest)
    def evidence_manifest() -> EvidenceManifest:
        return read_evidence_manifest(state)

    @app.get("/api/evidence/notes", response_model=EvidenceNotes)
    def evidence_notes() -> EvidenceNotes:
        return read_evidence_notes()

    @app.get("/api/evidence/approved-claims", response_model=EvidenceApprovedClaimsResponse)
    def evidence_approved_claims(
        source_key: str | None = None,
        model: str | None = None,
    ) -> EvidenceApprovedClaimsResponse:
        return list_approved_claims(state, source_key=source_key, model=model)

    @app.get("/api/harness/scenarios/{model_key}", response_model=list[TestScenarioPublic])
    def harness_test_scenarios(model_key: str) -> list[TestScenarioPublic]:
        scenarios = list_test_scenarios(model_key)
        if not scenarios:
            raise HTTPException(status_code=404, detail=f"Unknown test model: {model_key}")
        return scenarios

    @app.get("/api/harness/chat/{model_key}/{scenario_key}", response_model=HarnessChatThread)
    def harness_chat_thread(model_key: str, scenario_key: str) -> HarnessChatThread:
        return read_harness_chat(model_key, scenario_key)

    @app.post("/api/harness/chat/send", response_model=HarnessChatSendResult)
    def harness_chat_send(request: HarnessChatSendRequest) -> HarnessChatSendResult:
        return send_harness_chat(request)

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

    app.include_router(ml_router)
    app.include_router(agents_router)

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
