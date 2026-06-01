# Brain Spa

Local app for changing model behavior through a four-stage loop: **Evidence → Datasets → Tune → Test**.

Chipmunk is the voice-first operator on the home screen; the loop stages are where you approve proof, build rows, train adapters, and test behavior in real environments.

**License:** MIT — see [LICENSE](LICENSE).

## Quick start

```bash
git clone https://github.com/Balllvin/BrainSpa.git
cd BrainSpa
npm install
python3.11 -m pip install -r apps/api/requirements.txt  # or newer
```

Terminal 1 — API:

```bash
export BRAIN_SPA_DISABLE_TELEGRAM_POLLING=1   # recommended until Telegram is configured
npm run api
```

Terminal 2 — UI:

```bash
npm run dev
```

Open http://127.0.0.1:5173

Full self-host guide: [docs/self-host.md](docs/self-host.md). Environment template: [.env.example](.env.example).

## Verify install

```bash
npm run verify
```

Runs production build and API tests (`BRAIN_SPA_DISABLE_TELEGRAM_POLLING=1`).

## What this repo contains

```
brain-spa/
  apps/api/           Python FastAPI backend
  apps/web/src/       React + Vite UI
  packages/           Training and agent helpers
  docs/               Loop pipeline, audits, self-host
  .cursor/agents/     Optional Cursor review subagents
```

Runtime data lives outside the repo under `~/.brain-spa` (or `BRAIN_SPA_HOME`).

## Four-stage loop

| Stage | Route | You do |
|-------|-------|--------|
| Evidence | `/evidence` | Approve cited claims (Believer-first) |
| Datasets | `/datasets/believer/generate` | Generate training rows from approved evidence |
| Tune | `/tune/believer` | Dry-run and build LoRA adapter |
| Test | `/test/believer` | Try the model (counsel, witness, …) |
| Settings | `/settings` | xAI key, Telegram, stage harness CLIs |

Handoffs are **files + API state** under `~/.brain-spa/artifacts/`. See [docs/loop-pipeline-and-feedback.md](docs/loop-pipeline-and-feedback.md).

## Local API

Default: `http://127.0.0.1:8000`

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Liveness |
| `GET /api/overview` | Registry snapshot |
| `GET /api/evidence/models/believer` | Believer evidence summary |
| `GET /api/evidence/claims?model=believer` | Filtered claims |
| `POST /api/evidence/claims` | Add manual claim |
| `GET /api/evidence/approved-claims` | Datasets handoff |
| `POST /api/datasets/believer_seed/generate` | Generate JSONL rows |
| `POST /api/training/dry-run` | Training readiness |
| `POST /api/training/build-adapter` | LoRA build |
| `GET /api/harness/scenarios/{model_key}` | Test environments |

## Optional integrations

- **xAI / Grok** — Chipmunk voice and Evidence mining ([Settings → Chipmunk](http://127.0.0.1:5173/settings/chipmunk) or `XAI_API_KEY`)
- **Telegram** — Model bots; tokens in `~/.brain-spa/secrets/` only ([Settings → Telegram](http://127.0.0.1:5173/settings/telegram))
- **Stage CLIs** — Codex, OpenCode, Grok for agent harnesses ([Settings → Harnesses](http://127.0.0.1:5173/settings/agents))

External setup details: [docs/local-blockers.md](docs/local-blockers.md).

## Development

```bash
BRAIN_SPA_DISABLE_TELEGRAM_POLLING=1 npm run api
npm run dev
python3 -m pytest apps/api/tests -q
npm run build
```

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## Cursor agents (optional)

Project subagents in `.cursor/agents/`:

- `brain-spa-oss-readiness` — clone-and-run / release checklist
- `brain-spa-loop-critic` — loop UX vs Test patterns
- `brain-spa-install-verifier` — pytest + build smoke

## Legacy routes

Old paths redirect: `/registry` → `/evidence`, `/data` → `/datasets`, `/environments` → `/test`.
