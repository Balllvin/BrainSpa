# PROMPT — Evidence stage improvement (v2)

Paste into **Evidence-only** agent.

---

You are improving **Evidence** only in `/Users/alvin/Desktop/brain spa`. User audit: **Evidence is the weakest stage** — confusing multi-source picker, no Believer focus, no DIY claims. Datasets/Tune/Test agents are not your job; do not edit `pages/datasets/`, `pages/tune/`, `pages/test/`.

## Read first

- `docs/audits/evidence-stage-audit.md` (primary spec)
- `docs/audits/loop-integration-audit.md`
- `docs/harness-and-test-ui-guide.md`, `docs/loop-pipeline-and-feedback.md`
- Current: `apps/web/src/pages/evidence/*`, `apps/api/brainspa_api/evidence_store.py`

## What to keep (good)

- No back to Chipmunk on `/evidence`; arrow-only subpages
- Slug URLs; Approve/Weak/Reject; citation per claim; ingest focus textarea; solo grid

## What to fix (required)

### 1. Believer-first mental model (critical)

User must never wonder “which source do I pick for Believer?”

- Home: **primary panel** “Believer evidence” — behavior goal, total approved/pending for sources tagged `feeds_model: persona_small` (or `believer_seed`), buttons **Review pending** + **Add claim**
- Secondary: “Other sources” collapsed list (composer, recovery, etc.)
- Every Believer-linked source card shows: “Feeds Believer training set”

### 2. Unified review (critical)

- Add `/evidence/believer/review` (or `/evidence/review?model=believer`) showing **all pending claims** across Believer sources in one list
- Filters: Pending | Approved | Weak | Rejected
- Bulk: “Approve all pending with citation” (safe rule: citation non-empty)

### 3. Manual claims (critical — user DIY)

- “Add claim” form: text, citation, optional source dropdown
- POST `/api/evidence/claims` → status `pending`
- User can edit/delete own pending claims

### 4. Downstream clarity

- When `approved_count > 0`: green banner “Ready for Datasets — generate Believer training rows” → link `/datasets/believer/generate`
- Tooltip: Weak = flagged not used; Reject = excluded; Approve = used for row generation

### 5. Ingest UX

- Before mine: show what will run (focus text, backend name)
- After mine: scroll to review with new claims highlighted

## Backend

- Tag sources with `feeds_models: string[]` in state or evidence notes
- `GET /api/evidence/claims?model=believer&status=pending`
- `POST /api/evidence/claims`, bulk approve endpoint
- Keep manifest `approved_count` correct

## Banned

- Equal-weight 3-source grid with no Believer context
- Registry keys in UI (`believer_voice_refs`)
- Harness tools/scores on home

## Do not break

- Datasets evidence gate (`read_evidence_manifest`)
- Existing slugs/redirects in `evidenceRoutes.ts`

## Verify

- Browser: home → add claim → approve → banner → Datasets link
- `npm run build`, pytest for new routes

Report: what changed, new routes, how Believer vs other sources are separated.
