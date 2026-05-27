# Brain Spa

Local Brain Spa app for making a small AI from your own data. The app uses a TypeScript UI and a Python FastAPI backend for datasets, training, eval harnesses, agents, and Telegram setup.

## This folder

```
brain spa/
  apps/api/      ← local Python FastAPI backend
  apps/web/src/  ← TypeScript UI
  docs/          ← product requirements and implementation tracker
  Retired/       ← preserved inactive snapshots and old references
  package.json
```

The active product name is Brain Spa. Legacy code is source material only and lives under `Retired/` when it is no longer part of the active app.

## Quick start

```bash
cd ~/Desktop/brain\ spa
npm install
python3 -m pip install -r apps/api/requirements.txt
npm run api
```

In another terminal:

```bash
npm run dev
```

Open http://127.0.0.1:5173

```bash
npm run build
```

## Local API

The backend listens on `http://127.0.0.1:8000` and stores runtime state under `~/.brain-spa` unless `BRAIN_SPA_HOME` is set.

Useful endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/overview` | Dashboard state, tools, agents, models, datasets, environments, Telegram links |
| `POST /api/datasets/generate` | Generate the Believer seed dataset and SFT handoff |
| `POST /api/training/dry-run` | Resolve trainer recipes and report missing runtime modules |
| `POST /api/training/build-adapter` | Train a local Believer LoRA adapter |
| `POST /api/training/test-adapter` | Generate from the adapter and score it in the Believer harness |
| `POST /api/evals/run` | Run chat or chess harness scoring with fine-grained comments |
| `POST /api/telegram/bots` | Store a bot token in the local backend secret file |
| `POST /api/telegram/authorize` | Verify allowed-chat routing before Telegram messages reach Chipmunk |
| `POST /api/workers/run` | Preview a controlled agent-backend job |

## Telegram And Chipmunk

Add a bot from `/settings` with:

- Bot name
- Bot token from BotFather
- Allowed Telegram chat ID
- Model link

Tokens are written to `~/.brain-spa/secrets/telegram-bots.json` with restricted permissions and are never returned through the API. The Telegram gate rejects any chat ID that does not match the configured allowed user. Hermes is shown as blocked until Telegram is live-verified; the source of truth is `https://github.com/NousResearch/hermes-agent`.

## Model And Dataset Lifecycle

Models use `candidate`, `active`, `failed`, `retired`, and `archived`.

Datasets use `draft`, `validated`, `active`, `retired`, and `archived`.

Lifecycle changes are explicit API calls and invalid jumps are rejected. State remains local under `~/.brain-spa/state`, with a SQLite event log for lifecycle and dataset events.

## Training And Environments

The current validation project generates 100 Believer rows for `HuggingFaceTB/SmolLM2-360M-Instruct`, writes SFT and preference files, writes trainer recipes, trains a local LoRA adapter, and tests the adapter in the Believer harness.

The environment harnesses include:

- Believer chat scoring: conviction, generic phrasing, directness.
- Chess scoring: Stockfish availability, legal FEN validation through `python-chess`, image-to-FEN stage note, explanation quality.

External setup that requires Alvin's credentials or installs is tracked in `docs/local-blockers.md`.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Model workbench |
| `/data` | Dataset, training, adapter testing, and Believer harness |
| `/chess` | Chess environment harness |
| `/registry` | Projects, models, datasets, and environments |
| `/settings` | Telegram, Hermes readiness, worker backends, and engines |

Optional: `VITE_BACKEND_URL=http://127.0.0.1:8000 npm run dev`

## Backend checks

```bash
python3 -m pytest apps/api/tests -q
python3 -m py_compile apps/api/brainspa_api/*.py
npm run build
```
