# Agent prompt: Roll out loop-stage UX (Evidence, Datasets, or Tune)

Copy everything below the line into a new agent task. Replace `STAGE` with `evidence`, `datasets`, or `tune` (one stage per task).

---

## Task

Redesign the **STAGE** loop stage in the canonical Brain Spa app to match the **Test** reference: separate **agent harness (backend)** from **user UI (frontend)**, use the right **page archetype** per intent, and follow the anti-slop rules.

**Read first (required):**

- `/Users/alvin/Desktop/brain spa/docs/harness-and-test-ui-guide.md`
- Test implementation: `apps/web/src/pages/test/`, `apps/web/src/lib/testRoutes.ts`, `apps/web/src/styles/tactical.css` (`.test-*`)
- Current stage (to replace): `apps/web/src/pages/LoopPages.tsx` → `STAGEPage`
- API: `apps/api/brainspa_api/`

**App paths**

- Repo: `/Users/alvin/Desktop/brain spa`
- Dev UI: `http://127.0.0.1:5173` (bind `127.0.0.1`, not IPv6-only localhost)
- API: `npm run api` from repo root

---

## What you are building

### Backend (agent harness + user request processing)

- Expose **HTTP APIs** for what the human needs (list sources, generate rows, dry-run training, etc.).
- Persist artifacts under `~/.brain-spa/artifacts/<stage>/`.
- Keep CLI/Telegram harness config in **Settings → Harnesses** — do not put `tools:` / `scores:` / `stageKey` on the stage home page.
- Use **registry keys** in API payloads only; never as primary UI labels (use display names, e.g. Believer not `persona_small`).
- If the stage has **chat**, reuse the Test pattern: `harness_chat`-style threads, real model generation, `model_feedback` for corrections.

### Frontend (user UI)

- **STAGE home** (`/STAGE`) = section root: **no** link back to Chipmunk; title = stage name only.
- **Human URLs**: slugs in paths (`/datasets/believer/rows`), with `STAGERoutes.ts` mapping slugs ↔ registry keys + legacy redirects.
- **Arrow-only** back on deeper pages (top-left), reuse or extract `TestNavArrow` pattern.
- **One archetype per screen** (see guide rollout blueprint for STAGE). Do not clone Test’s chat everywhere.
- If you add **chat**, you **must** implement the [Chat UX contract](harness-and-test-ui-guide.md#chat-ux-contract): optimistic user bubble, clear input on send, animated typing dots on the left (not “Thinking…” in the header), user right / assistant left, “Wrong answer?” where applicable.

---

## STAGE-specific intents (from guide — implement these URLs)

### If STAGE = evidence

| Route | Archetype | User job |
|-------|-----------|----------|
| `/evidence` | Overview | See sources, status |
| `/evidence/sources/:slug` | Form/wizard | Add or refresh source |
| `/evidence/:slug/review` | Review | Browse captured proof |

### If STAGE = datasets

| Route | Archetype | User job |
|-------|-----------|----------|
| `/datasets` | Overview | Pick dataset |
| `/datasets/:slug/generate` | Action + progress | Generate training rows |
| `/datasets/:slug/rows` | Review table | Curate bad rows |

### If STAGE = tune

| Route | Archetype | User job |
|-------|-----------|----------|
| `/tune` | Overview | Pick model |
| `/tune/believer/build` | Wizard | Dry-run / build adapter |
| `/tune/believer/try` | Chat or single-prompt | Smoke-test adapter |
| `/tune/believer/status` | Summary | Acceptance pass/fail (no raw eval dump) |

Adjust slugs to match registry; always show **Believer** in UI.

---

## Anti-slop (non-negotiable)

- Remove from stage home: `LoopShell` harness card, `tools:` / `scores:`, “Stage harness” as primary CTA, visible `stageKey` code labels.
- No registry keys in headings or cards.
- No duplicate thinking indicators; no chat layout for one-shot generate flows.
- Solo grids: no empty second column (use `--solo` pattern from Test).
- Small red hints on list rows, not oversized warning text.
- Browser-test every new route before claiming done (`npm run api` + dev server).

---

## Deliverables

1. New `apps/web/src/pages/STAGE/` (and `lib/STAGERoutes.ts`) wired in `App.tsx`.
2. Backend routes/schemas as needed in `apps/api/brainspa_api/` (plus tests in `apps/api/tests/`).
3. CSS in `tactical.css` (prefer shared `.loop-*` if reusing chat shell).
4. Remove or slim old `STAGEPage` in `LoopPages.tsx` once migrated.
5. Short note in PR/commit: which archetypes shipped and what APIs were added.

---

## Verification checklist

- [ ] `/STAGE` has no “back to Chipmunk”
- [ ] URLs use slugs; legacy keys redirect
- [ ] Display names, not registry keys, in UI
- [ ] Chat (if any): optimistic send + typing dots + no header “Thinking…”
- [ ] `cd apps/web && npm run build` passes
- [ ] API tests pass if backend changed
- [ ] Manual browser pass on all new routes

---

## Do not

- Reorganize `~/Projects/brain-spa` drafts or iCloud retired trees unless asked.
- Commit secrets or `.env` files.
- Leave Test broken while working on STAGE.
- Ship agent-facing harness UI as the main stage experience.

---

When finished, summarize: routes added, archetypes per route, APIs touched, and anything blocked for a follow-up task.
