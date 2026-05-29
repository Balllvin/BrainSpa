# PROMPT 3 of 3 — Tune stage (parallel agent)

Paste everything below into a **dedicated agent** (Tune only). Two other agents run Evidence and Datasets at the same time; do not edit their files.

---

## Mission

Rebuild **Tune** (`/tune`) as the **user-facing** stage that **dry-runs**, **builds**, and **registers** adapter artifacts (Believer: `persona_small` + `believer_seed` → `artifacts/training/.../believer_adapter`). Training Model harness runs in the backend; users see **progress and outcomes**, not trainer internals.

**Read completely before coding:**

1. `docs/loop-pipeline-and-feedback.md` — loop, feedback, adapter path, new model rollout  
2. `docs/harness-and-test-ui-guide.md` — archetypes, anti-slop; optional chat for “try adapter”  
3. `docs/ui-ux-architecture.md`  
4. Test reference + real generation: `workflows.py`, `pages/test/`  
5. Replace: `LoopPages.tsx` → `TunePage` only  
6. Existing APIs in `backend.ts`: `runTrainingDryRun`, `buildTrainingAdapter`, `testTrainingAdapter`, `runBelieverAcceptance`  
7. Harness `tune` in `state.py` — artifacts: `dry_run.json`, `believer_adapter`, etc.

**Runtime:** `~/.brain-spa/artifacts/training/`; dev `http://127.0.0.1:5173`.

---

## Your place in the loop

| You consume | You produce | Downstream |
|-------------|-------------|------------|
| Dataset handoff + JSONL (**Datasets**) | LoRA adapter on disk, model state updated | **Test** uses adapter via same path as Telegram |
| Model registry | dry_run.json, build result, missing requirements | Acceptance summary for user |
| — | “Ready” / “blocked” human status | Chipmunk/Settings do not replace this page |

**Tune does not** replace Test. Single-prompt “try adapter” is optional smoke; full environments stay on `/test/believer/...`.

After feedback import + dataset regen, UI must show **dataset stale → rebuild recommended**.

---

## Deliverables

### Frontend (you own)

- `apps/web/src/pages/tune/`  
- `apps/web/src/lib/tuneRoutes.ts` — `believer` ↔ `persona_small`  

| URL | Archetype | User job |
|-----|-----------|----------|
| `/tune` | Overview | Models with adapter status (ready / missing / stale); **Believer** not `persona_small`; link to build & test |
| `/tune/believer/build` | Wizard | Select dataset (default `believer_seed`) → Dry-run → Build adapter; step progress; errors inline |
| `/tune/believer/status` | Summary | Last build time, dataset used, acceptance pass/fail (no raw 10-case dump on main—expandable details) |
| `/tune/believer/try` | Single-prompt (optional) | One input, one answer via `testTrainingAdapter`; **not** full chat UI unless you reuse Test chat shell with chat UX contract |

- No harness tools/scores on `/tune` home.  
- No back to Chipmunk; arrow-only subpages.  
- CSS: `.tune-*` only.  
- **App.tsx:** replace **only** `/tune` routes.  
- Remove `TunePage` from `LoopPages.tsx`.

### Backend (you own)

- Organize tune routes under `/api/tune/…` if not already grouped.  
- Minimum: model status (adapter exists?, dataset row count, stale flag), dry-run, build (async-friendly: return job id or clear “running”), acceptance summary, adapter test prompt.  
- Stale detection: compare dataset `updated_at` or row count vs last build metadata.  
- Ensure build output path matches what `workflows._generate_believer_answer` loads.  
- Tests for dry-run + status endpoints.

### Do NOT edit

- `pages/test/**` (reference only)  
- `pages/evidence/**`, `pages/datasets/**`  
- Break Believer generation path in `workflows.py` without tests  

---

## UX rules

- Wizard shows **Dry-run** then **Build (slow)** with disabled states and labels—not stack traces.  
- Show missing modules as plain English from `missing_requirements`.  
- Link after successful build: **Test Believer** → `/test/believer`.  
- If chat on `/try`: optimistic send + typing dots (harness guide).  
- Browser-test all routes; build + pytest.

---

## Believer / adapter critical path

- Default model slug `believer`.  
- Build must target path consistent with:
  `artifacts/training/believer_validation/believer_adapter` (verify in `config.py` / workflows).  
- Acceptance: user sees **Pass / Needs work** + count; artifact path in details only.  
- After build, Test witness/counsel must use **real adapter** (already fixed in workflows—do not reintroduce keyword fallback).

---

## New model note (design for future)

Overview should support **multiple models** from registry (same layout as `/test` solo grid). Adding a model = state registry + slug in `tuneRoutes.ts` + dataset link—not hardcode Believer only in logic, but Believer is the default seed implementation.

---

## Coordination

- Read dataset handoff from Datasets artifact or `GET /api/datasets/believer` (if other agent added).  
- Document in summary which API Tune exposes for home loop “latest artifact” later.

---

## Definition of done

- [ ] `/tune`, `/tune/believer/build`, `/tune/believer/status` work in browser  
- [ ] Dry-run and build call existing training flows; errors readable  
- [ ] Status shows adapter ready + link to Test  
- [ ] Stale dataset warning when row count changed post-build (best-effort)  
- [ ] Only Tune-owned files + App.tsx tune routes touched  
- [ ] Build + tests pass  
- [ ] Summary: routes, APIs, adapter path, Test link  

Iterate until done; then stop.
