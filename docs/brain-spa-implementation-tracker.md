# Brain Spa Implementation Tracker

This file tracks what is real, what was tested, and what still needs external input.

## Current App

- Root: `/Users/alvin/Desktop/brain spa`
- UI: `apps/web/src`
- API: `apps/api/brainspa_api`
- Python packages: `packages/brainspa_*`
- Runtime state: `~/.brain-spa`
- Product name: Brain Spa only
- Deployment target: local macOS

## Completed Build Work

- [x] One active Brain Spa app.
- [x] TypeScript UI.
- [x] Python FastAPI backend.
- [x] Runtime-local state and artifacts.
- [x] Retired code moved under `Retired/`.
- [x] Old product names removed from active UI.
- [x] Home workbench simplified.
- [x] Data page builds and tests the Believer model path.
- [x] Dedicated chess page added.
- [x] Registry shows projects, sources, models, datasets, and environments.
- [x] Settings handles Telegram, Hermes, workers, and engines.
- [x] Stockfish is shown as a chess engine, not an agent.
- [x] Hermes stays blocked unless Telegram is live-verified.
- [x] Fake Telegram token does not mark Hermes ready.
- [x] Worker detection covers Codex, OpenCode, Grok, Cursor, Hermes, and Stockfish.
- [x] Model lifecycle transitions are explicit.
- [x] Dataset lifecycle transitions are explicit.
- [x] Invalid lifecycle transitions fail through the API.

## Believer Build Evidence

- [x] Generated 100 Believer dataset rows.
- [x] Dataset warnings: none.
- [x] SFT JSONL written.
- [x] Preference pairs written.
- [x] Handoff manifest written.
- [x] Trainer modules installed: `torch`, `transformers`, `datasets`, `trl`, `peft`.
- [x] Training dry-run completed with `transformers_trl`.
- [x] Adapter build completed using `HuggingFaceTB/SmolLM2-360M-Instruct`.
- [x] Adapter build used 100 rows.
- [x] Adapter build ran 150 optimizer steps.
- [x] Adapter final loss: `0.15388262271881104`.
- [x] Adapter saved at `~/.brain-spa/artifacts/training/believer_validation/believer_adapter`.
- [x] Adapter generated an answer through the app backend.
- [x] Believer harness scored the generated answer.
- [x] First weak adapter test failed conviction grounding.
- [x] Stronger adapter build fixed that failure.
- [x] Final adapter test passed with score `1.0`.

Final generated answer tested:

```text
Name the fear, name it as abstract and human, and return to God with the matter anew. Courage is not deciding right, it is facing what is real. In this situation, when fear starts steering my choices, Name the name and return to God. Step 3: act today, then pray again.
```

## Environment Evidence

- [x] Believer chat harness scores conviction, generic phrasing, and directness.
- [x] Believer manual answer test passes for a grounded direct answer.
- [x] Believer adapter answer test passes after stronger training.
- [x] Chess harness validates FEN with `python-chess`.
- [x] Chess harness checks Stockfish availability.
- [x] Chess harness separates rules, board state, image stage, and explanation comments.
- [x] Dedicated chess UI submits role, FEN, move, and explanation.

## Backend Evidence

- [x] `GET /api/health`
- [x] `GET /api/overview`
- [x] `POST /api/datasets/generate`
- [x] `POST /api/training/dry-run`
- [x] `POST /api/training/build-adapter`
- [x] `POST /api/training/test-adapter`
- [x] `POST /api/evals/run`
- [x] `POST /api/telegram/bots`
- [x] `POST /api/telegram/authorize`
- [x] `POST /api/workers/run`
- [x] model lifecycle endpoints
- [x] dataset lifecycle endpoints

## Automated Verification

- [x] `python3 -m pytest apps/api/tests -q`
- [x] `python3 -m py_compile apps/api/brainspa_api/*.py packages/brainspa_core/*.py packages/brainspa_training/*.py packages/brainspa_agents/*.py packages/brainspa_environments/*.py`
- [x] `npm run build`

## Browser Verification

- [x] Desktop Home buttons clicked, including 150-step adapter build.
- [x] Desktop Settings buttons clicked, including fake-token Telegram block and all worker verifies.
- [x] Desktop Data buttons clicked, including 150-step adapter build and adapter test.
- [x] Desktop Chess button clicked.
- [x] Desktop Registry tabs and lifecycle controls clicked.
- [x] Mobile Home overflow check passed.
- [x] Mobile Data overflow check passed.
- [x] Final browser QA passed with 30 actions.
- [x] Final console error check passed with zero console errors.

## External Items

These are not app blockers because the app handles them honestly:

- Telegram needs a real BotFather token and allowed chat ID before Hermes can be live.
- Cursor needs a detectable CLI or app command on `PATH`.
- Image-to-FEN needs a real local vision model before it should be exposed as working.

## Remaining Before GitHub

- [x] Rewrite README for the final endpoints and routes.
- [x] Run final browser QA and click every visible control.
- [x] Clean generated caches from the repository.
- [x] Add open-source license.
- [ ] Commit the finished app.
- [ ] Create the public GitHub repository.
