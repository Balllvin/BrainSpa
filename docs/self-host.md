# Self-hosting Brain Spa

Brain Spa is **local-first**: one machine, one operator, artifacts on disk under `BRAIN_SPA_HOME` (default `~/.brain-spa`). There is no hosted multi-tenant mode in this repo.

## Requirements

| Component | Version |
|-----------|---------|
| Node.js | 20+ recommended |
| Python | 3.11+ |
| OS | macOS or Linux tested; Windows may need path tweaks |

Optional for the full loop (Tune adapter build, believer generation):

- GPU or patience for CPU training
- ~2GB+ disk for small HF models
- `torch`, `transformers`, `datasets`, `trl`, `peft` (see `apps/api/requirements.txt`)

## Install

```bash
git clone https://github.com/Balllvin/BrainSpa.git
cd BrainSpa
npm install
python3.11 -m pip install -r apps/api/requirements.txt  # or newer
```

Copy `.env.example` to `.env` if you need non-default hosts or keys. The API reads `.env` from the project root before resolving `BRAIN_SPA_HOME`.

## Run

Terminal 1 — API:

```bash
npm run api
```

Set `BRAIN_SPA_DISABLE_TELEGRAM_POLLING=1` only when you want the Telegram worker off.

Terminal 2 — UI:

```bash
npm run dev
```

Open http://127.0.0.1:5173

## Verify

```bash
npm run verify
```

Or manually:

```bash
npm run build
BRAIN_SPA_DISABLE_TELEGRAM_POLLING=1 python3 -m pytest apps/api/tests -q
curl -s http://127.0.0.1:8000/api/health
```

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `BRAIN_SPA_HOME` | No | Runtime root (default `~/.brain-spa`) |
| `VITE_BACKEND_URL` | No | Frontend API base (default `http://127.0.0.1:8000`) |
| `BRAIN_SPA_API_HOST` / `BRAIN_SPA_API_PORT` | No | API bind address |
| `BRAIN_SPA_CORS_ORIGINS` | No | Comma-separated dev UI origins |
| `XAI_API_KEY` | No | Grok voice + Evidence mining (Settings can store key too) |
| `BRAIN_SPA_DISABLE_TELEGRAM_POLLING` | No | Set `1` to disable Telegram worker |
| `HF_TOKEN` | No | Gated Hugging Face models only |

## Secrets

- Telegram bot tokens: Settings UI → `~/.brain-spa/secrets/telegram-bots.json` (mode `600`)
- xAI key: Settings → Chipmunk or `~/.brain-spa/secrets/xai-api-key`

Never commit secrets or `BRAIN_SPA_HOME` contents. The public GitHub repo is only the reusable Brain Spa shell; keep generated evidence, datasets, adapters, eval outputs, transcripts, and local model configuration outside git. See [docs/public-shell-boundary.md](public-shell-boundary.md).

## Four-stage loop (user routes)

| Stage | Entry | Job |
|-------|-------|-----|
| Evidence | `/evidence` | Approve cited claims for Believer |
| Datasets | `/datasets` | Rows from approved evidence |
| Tune | `/tune` | Dry-run and build adapter |
| Test | `/test` | Try model in environments |

See `docs/loop-pipeline-and-feedback.md` and `docs/harness-and-test-ui-guide.md`.

## Optional CLIs

Evidence/Datasets/Tune stage agents can use Codex, OpenCode, or Grok when installed — configure in Settings → Harnesses. Missing CLIs show as not installed; core UI still works.

## Troubleshooting

- **Connection refused on :5173** — Vite binds `127.0.0.1`; use that host, not IPv6-only `localhost`.
- **API offline in UI** — Run `npm run api` and check `curl http://127.0.0.1:8000/api/health`.
- **Evidence ingest empty** — Set xAI key or use local draft claims (no key).
- **Training fails** — Install full `requirements.txt`; check disk and `docs/local-blockers.md`.
