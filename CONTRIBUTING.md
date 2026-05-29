# Contributing to Brain Spa

Thanks for helping improve local-first model behavior tooling.

## Development setup

```bash
git clone https://github.com/Balllvin/brain-spa-local-ai.git
cd brain-spa-local-ai
npm install
python3 -m pip install -r apps/api/requirements.txt
```

Run API + UI:

```bash
BRAIN_SPA_DISABLE_TELEGRAM_POLLING=1 npm run api
npm run dev
```

## Before you open a PR

```bash
npm run verify
```

This runs `npm run build` and API tests with Telegram polling disabled.

## Project layout

- `apps/web/src/` — React UI (Evidence, Datasets, Tune, Test, Settings, Chipmunk)
- `apps/api/brainspa_api/` — FastAPI backend and artifacts logic
- `packages/` — shared training/agent helpers
- `docs/` — product and loop pipeline docs

## Loop stage boundaries

When changing one loop stage, edit only that stage’s pages and API modules unless coordinating a handoff contract. See `docs/loop-pipeline-and-feedback.md`.

## Cursor agents

Shared review agents live in `.cursor/agents/`:

- `brain-spa-oss-readiness` — release / clone-and-run checklist
- `brain-spa-loop-critic` — loop UX anti-slop
- `brain-spa-install-verifier` — install smoke tests

## Commits and PRs

- One logical change per PR when possible
- Include what you verified (pytest, build, browser route)
- Do not commit `~/.brain-spa`, `.env`, tokens, or Playwright scratch files

## License

By contributing, you agree your contributions are licensed under the MIT License in `LICENSE`.
