# PROMPT — Tune stage improvement (v2)

Paste into **Tune-only** agent.

---

You are improving **Tune** only in `/Users/alvin/Desktop/brain spa`. User says Tune is **pretty good** but too **agent-shaped** — needs more **user-facing options** and clearer hub. Do not edit `pages/evidence/`, `pages/datasets/`, `pages/test/`.

## Read first

- `docs/audits/tune-stage-audit.md` (primary spec)
- `docs/audits/loop-integration-audit.md`
- `apps/web/src/pages/tune/*`, `TuneRoutes.tsx`
- Training APIs in `apps/web/src/lib/backend.ts`

## What to keep (good)

- Adapter state badges; stale banner; wizard dry-run → build; acceptance Pass/Needs work; expandable cases; Test CTA; slug URLs; quick try page

## What to fix (required)

### 1. Model hub (high)

Add `/tune/believer` (or enhance model landing) with **four cards** (like Test environments):

| Card | Goes to |
|------|---------|
| Build adapter | `/tune/believer/build` |
| Status & acceptance | `/tune/believer/status` |
| Quick try | `/tune/believer/try` |
| Test environments | `/test/believer` |

Overview `/tune` stays model picker only.

### 2. Human labels (medium)

- Dataset select: **“Believer training set (N rows)”** never `believer_seed` in visible text
- Use `datasetDisplayLabel` from `datasetsRoutes.ts` (import shared helper or duplicate minimally in `tuneDisplay.ts`)

### 3. Pre-build summary (high)

On build page before Dry-run:

- Dataset row count + last modified
- Scenario breakdown if API provides (from datasets metadata)
- Last build: date, rows used, adapter state
- If stale: explain why (feedback imported / row count changed)

### 4. User options without becoming a trainer IDE (medium)

**Advanced** collapsible on build page:

- Training preset: Fast / Standard / Quality (maps to steps/epochs internally)
- Read-only display of what will run
- Do not expose 20 hyperparams — 1–2 meaningful choices max

### 5. Build progress (high)

Long build: show phase text (“Loading base model…”, “Training step 4/12…”) via polling endpoint or SSE if available; if not, honest “This takes several minutes” + disable double-submit.

### 6. Stale loop copy (medium)

When stale because Datasets changed:

> “Training set changed since last build. Review rows or rebuild.”

Links: `/datasets/believer/rows`, `/datasets/believer/generate`

### 7. Try page polish (low)

- Link from hub
- After result: “Open full Test → witness” deep link
- Do not duplicate Test chat UX here unless reusing shared shell

## Banned

- Harness tool list on tune home
- Raw artifact paths in primary view (details only)
- Registry keys in headings

## Do not break

- Adapter output path used by `workflows._generate_believer_answer`
- Dry-run gating before build
- `testModelPath` links

## Verify

- `/tune` → believer hub → build → status → test link
- Stale state shows when dataset row count changes (simulate)
- npm run build; pytest if API touched

Report: new routes, user-visible options, what remains agent-only in Settings.
