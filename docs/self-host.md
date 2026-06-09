# Self-Host Guide

Brain Spa runs locally with a Vite UI and FastAPI backend.

## Install

```bash
npm install
python3.11 -m pip install -r apps/api/requirements.txt
```

## Run

```bash
npm run start
```

Open http://127.0.0.1:5173.

The API runs on http://127.0.0.1:8000. Vite proxies `/api` to the backend.

## Runtime Data

By default, local state lives under:

```text
~/.brain-spa
```

Override it with:

```bash
BRAIN_SPA_HOME=/path/to/runtime npm run start
```

Runtime data is intentionally outside git. This includes Snake rollout rows, checkpoints, eval output, Telegram tokens, and worker state.

## Verify

```bash
npm run verify
```

For Snake browser smoke coverage:

```bash
npm run start
node scripts/smoke-snake.mjs
```

Screenshots from smoke tests are local output and ignored by git.

## First-Run Expected State

A clean clone should show:

- Evidence: no seeded sources
- Datasets: Snake rollout exists but has no transitions yet
- Tune: Snake Policy has no checkpoint yet
- Test: Snake environments are ready to run

Run `/test/snake/autonomous-train` to create local rollout data and train a policy checkpoint.

## Optional Integrations

- xAI/Grok for Chipmunk voice and evidence mining
- Telegram for local model/notification bots
- Codex/OpenCode/Grok/Cursor as worker backends

Secrets live in the runtime secret store, not in this repository.
