# Public Shell Boundary

Brain Spa's GitHub repository is the reusable app shell: source code, UI, backend APIs, harness contracts, documentation, and setup instructions.

It is **not** the place for a user's generated model behavior work.

## What stays out of git

Keep these local under `~/.brain-spa` or another `BRAIN_SPA_HOME` outside the repository:

- Evidence sources, extracted claims, source notes, transcripts, and provenance ledgers.
- Generated datasets, JSONL rows, preference pairs, dataset manifests, and handoff files.
- Tune outputs: dry-run results, trainer recipes generated from local state, checkpoints, LoRA adapters, model weights, and acceptance artifacts.
- Test outputs: harness chat logs, eval results, feedback rows, scores, and environment state.
- Personal model configs, Telegram bot tokens, xAI/OpenAI/OpenRouter/Anthropic keys, OAuth/auth files, and `.env` files.
- Browser/Playwright scratch logs, screenshots, caches, and local runtime databases.

## What belongs in git

Commit only reusable shell assets:

- `apps/api/` and `apps/web/` source code.
- Generic harness contracts and default app state needed for a fresh install.
- Tests using temporary directories, fixtures, or synthetic examples.
- Documentation that explains how users configure their own local runtime.
- `.env.example`, never real `.env` files.

## Runtime location

Default runtime data lives here:

```bash
~/.brain-spa
```

Override it when needed:

```bash
export BRAIN_SPA_HOME=/path/outside/this/repo
```

Do not set `BRAIN_SPA_HOME` to the repository root or a subdirectory that might be committed.

## Required check before PRs

Run:

```bash
npm run check:public-shell
npm run verify
```

`npm run verify` already includes the public-shell check. It fails if tracked or unignored candidate files look like runtime artifacts, generated datasets/models, local secrets, or high-confidence API tokens.

## PR rule

Every PR into `main` should be able to answer yes to this:

> Could a new user clone this repository and start from a clean shell with their own evidence, datasets, models, secrets, and runtime state?

If not, move the generated/personal files to `~/.brain-spa` or a separate private runtime backup before opening the PR.
