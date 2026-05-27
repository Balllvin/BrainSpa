# Brain Spa

Local Brain Spa app for changing model behavior. The app uses a TypeScript UI and a Python FastAPI backend for evidence, datasets, fine-tuning, test harnesses, worker models, and runtime setup.

Chipmunk is the JARVIS-like operator for Brain Spa. It routes and operates the evidence, dataset, tuning, and test loop for training and tuning user-owned models.

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
| `GET /api/overview` | Local state, tools, workers, models, datasets, environments, Telegram links |
| `POST /api/datasets/generate` | Generate the active seed dataset and SFT handoff |
| `POST /api/training/dry-run` | Resolve trainer recipes and report missing runtime modules |
| `POST /api/training/build-adapter` | Train a local LoRA adapter |
| `POST /api/training/test-adapter` | Generate from the adapter and score it in the active harness |
| `POST /api/evals/run` | Run environment harness scoring with fine-grained comments |
| `POST /api/telegram/bots` | Store a bot token in the local backend secret file |
| `POST /api/telegram/authorize` | Verify allowed-chat routing before Telegram messages reach the worker router |
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

## Brain Spa Loop

Brain Spa works in four parts:

1. Evidence: find proof of the behavior the user wants.
2. Datasets: turn evidence into rows and preference pairs.
3. Tune: dry-run, fine-tune, and write adapter artifacts.
4. Test: put the model in environments and score behavior.

The current validation project generates 100 rows for `HuggingFaceTB/SmolLM2-360M-Instruct`, writes SFT and preference files, writes trainer recipes, trains a local LoRA adapter, and tests the adapter in an active harness.

The environment builder defines state, allowed actions, and scoring rules before training data is generated. Built-in harnesses include:

- Persona chat scoring: conviction, generic phrasing, directness.
- Chess position scoring: Stockfish availability, legal FEN validation through `python-chess`, image-to-FEN stage note, explanation quality.

External setup that requires Alvin's credentials or installs is tracked in `docs/local-blockers.md`.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Four-part loop map |
| `/evidence` | Sources and behavior evidence |
| `/datasets` | Dataset generation and handoff |
| `/tune` | Dry-run, adapter build, and adapter test |
| `/test` | Environment and harness checks |
| `/settings` | Telegram, Hermes readiness, worker backends, and engines |

Optional: `VITE_BACKEND_URL=http://127.0.0.1:8000 npm run dev`

## Backend checks

```bash
python3 -m pytest apps/api/tests -q
python3 -m py_compile apps/api/brainspa_api/*.py
npm run build
```
