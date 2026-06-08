# Contributing to Brain Spa

Thanks for helping improve local-first model behavior tooling.

## Development setup

```bash
git clone https://github.com/Balllvin/BrainSpa.git
cd BrainSpa
npm install
python3.11 -m pip install -r apps/api/requirements.txt  # or newer
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

This runs the public-shell guard, production build, and API tests with Telegram polling disabled. See `docs/public-shell-boundary.md` for what must stay out of GitHub.

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

## Branch workflow

- `main` is the clean public canonical branch on GitHub.
- `local-runtime` is the local working branch for Brain Spa iteration on a private runtime branch.
- Make changes on `local-runtime`, push that branch, then open PRs into `main`.
- Before pushing, run `npm run verify`; it includes `npm run check:public-shell`.
- Keep runtime state outside git: `~/.brain-spa`, `.env`, tokens, generated evidence, datasets, adapters, transcripts, evals, and Playwright scratch files stay local.

## Commits and PRs

- One logical change per PR when possible
- Include what you verified (pytest, build, browser route)
- Do not commit `~/.brain-spa`, `.env`, tokens, generated evidence, datasets, adapters, model weights, eval outputs, transcripts, or Playwright scratch files

## License

By contributing, you agree your contributions are licensed under the MIT License in `LICENSE`.
