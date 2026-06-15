# Brain Spa

Local app for changing model behavior through a four-stage loop: **Evidence -> Datasets -> Tune -> Test**.

Snake Policy is the reference environment, but the **Studio** (Tune → Studio) lets you train *any* compact model from scratch on your machine: reinforcement-learning policies (CartPole, GridWorld, Snake) with tabular Q-learning, DQN, PPO, or REINFORCE, and tabular classifiers/regressors (logistic/linear regression with no dependencies, or an MLP). Every run streams live metrics and stays inspectable. See [docs/ml-platform.md](docs/ml-platform.md).

The public shell includes the UI, APIs, environment package, generic ML core, rollout dataset tooling, policy trainer, and tests needed to run the full loop from scratch. It does not ship trained model weights, checkpoints, generated screenshots, local runtime state, secrets, or previous run artifacts.

**License:** MIT - see [LICENSE](LICENSE).

## Quick Start

```bash
git clone https://github.com/Balllvin/BrainSpa.git
cd BrainSpa
npm install
python3.11 -m pip install -r apps/api/requirements.txt  # or newer
npm run start
```

Open http://127.0.0.1:5173.

Full self-host guide: [docs/self-host.md](docs/self-host.md). Environment template: [.env.example](.env.example).

## Verify

```bash
npm run verify
```

Runs the production build and API test suite with Telegram polling disabled.

## What Ships

```text
brain-spa/
  apps/api/                         Python FastAPI backend
  apps/web/src/                     React + Vite UI
  packages/brainspa_environments/   Environment implementations
  packages/brainspa_training/       Training helpers
  docs/                             Architecture and harness guidance
  scripts/                          Dev and smoke-test scripts
```

Runtime data lives outside the repo under `~/.brain-spa` or `BRAIN_SPA_HOME`.

## Four-Stage Loop

| Stage | Route | Current shell behavior |
|-------|-------|------------------------|
| Evidence | `/evidence` | Source inbox starts empty until a model behavior needs cited proof. |
| Datasets | `/datasets/snake/rollout` | Shows Snake rollout transitions after autonomous training runs. |
| Tune | `/tune/snake` | Shows policy checkpoint state, training controls, reset, and eval summary. |
| Test | `/test/snake` | Runs Snake environments: six-board train, watch, human play, coach replay, and arena. |
| Settings | `/settings` | Runtime configuration, tokens, stage backends, and model bot wiring. |

## Snake Reference

Snake is the reference for future harnesses because it demonstrates the complete non-LLM loop:

- environment package: `packages/brainspa_environments/snake/`
- policy training: `packages/brainspa_training/`
- API routes: `/api/env/snake/*`, `/api/policy/*`, `/api/datasets/snake/*`
- UI surfaces: `/test/snake/*`, `/datasets/snake/rollout`, `/tune/snake`

The expected first-run state is empty: no checkpoint, no rollout rows, no performance history. Running `/test/snake/autonomous-train` creates local artifacts under `~/.brain-spa`; those artifacts stay out of GitHub.

## Local API Highlights

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Liveness |
| `GET /api/overview` | Shell registry snapshot |
| `GET /api/harness/scenarios/snake` | Snake Test scenario list |
| `POST /api/env/snake/session` | Interactive Snake session |
| `POST /api/env/snake/lab/start` | Start six-board autonomous training |
| `POST /api/env/snake/reset` | Remove local Snake policy artifacts |
| `GET /api/datasets/snake/transitions` | Read rollout transitions |
| `POST /api/policy/snake/eval` | Evaluate the local policy checkpoint |

## Repository Hygiene

GitHub should contain source, docs, tests, and small static config only. Keep these out of git:

- `.env`, local secrets, Telegram tokens
- `~/.brain-spa` runtime data
- generated screenshots and Playwright output
- model weights, adapters, checkpoints, tensorboard/wandb runs
- generated datasets and training artifacts

The root `.gitignore` blocks those payloads by default.
