# PROMPT 2 of 3 — Datasets stage (parallel agent)

Paste everything below into a **dedicated agent** (Datasets only). Two other agents run Evidence and Tune at the same time; do not edit their files.

---

## Mission

Rebuild **Datasets** (`/datasets`) as the **user-facing** stage that turns **approved Evidence** into **training rows** and preference pairs for models like **Believer** (`believer_seed` → `persona_small`). This is the Data Model’s job in the loop **Evidence → Datasets → Tune → Test**.

**Read completely before coding:**

1. `docs/loop-pipeline-and-feedback.md` — handoffs, feedback from Test, Believer keys  
2. `docs/harness-and-test-ui-guide.md` — archetypes, anti-slop  
3. `docs/ui-ux-architecture.md`  
4. Test reference: `apps/web/src/pages/test/`  
5. Replace: `LoopPages.tsx` → `DatasetsPage` only  
6. Existing API: `generateDataset` in `apps/web/src/lib/backend.ts`, harness `datasets` in `state.py`  
7. Harness rules: rows must be grounded, varied, no source-copy (`scoring_rules` in state)

**Runtime:** artifacts under `~/.brain-spa/artifacts/datasets/`; JSONL + `sft_handoff.json`.

---

## Your place in the loop

| You consume | You produce | Downstream |
|-------------|-------------|------------|
| **Approved** evidence manifest/claims (Evidence API or file) | `believer_seed` JSONL, preference pairs, handoff manifest | **Tune** dry-run + build adapter |
| **Test** feedback (`model_feedback` JSONL) | Corrected rows / preference pairs (bad vs user fix) | Retrain triggers Tune |
| Dataset registry in state | Row counts, warnings, dataset `state` | **Test** environments assume training existed |

**Good rows for Believer:** blunt, compressed, persona-specific; explicit rejected answers; failure labels when model is wrong.

**Bad rows:** generic assistant hedging, copied source paragraphs, template repetition.

**Design rows so Test scenarios pass:** counsel = pastoral tone; witness = faith defense; advice = direct guidance—not one generic template.

---

## Deliverables

### Frontend (you own)

- `apps/web/src/pages/datasets/`  
- `apps/web/src/lib/datasetsRoutes.ts` — slug `believer` ↔ `believer_seed` (and legacy redirects)  

| URL | Archetype | User job |
|-----|-----------|----------|
| `/datasets` | Overview | List datasets linked to models (**Believer** label); row count, state, last generated; solo grid if one dataset |
| `/datasets/believer/generate` | Action + progress | Generate from approved evidence; CTA busy state; show warnings count |
| `/datasets/believer/rows` | Review table | Scan/edit/delete rows; flag duplicate; **Import feedback from Test** (button → API batches corrections into preference pairs) |

- No “back to Chipmunk”; arrow-only on subpages.  
- Hide `manifest_path` behind details; show “12 rows · 2 warnings · ready for Tune”.  
- CSS: `.datasets-*` only.  
- **App.tsx:** replace **only** `/datasets` routes.  
- Remove `DatasetsPage` from `LoopPages.tsx`.

### Backend (you own)

- Extend or add `datasets_workflows.py`, routes `/api/datasets/…`  
- Minimum: list datasets, get dataset detail, `POST generate` (wrap existing logic), list rows (paginated), delete/patch row, `POST import-test-feedback` reading `model_feedback_path()` from config.  
- Enforce: generation refuses or warns if no approved evidence (call Evidence manifest or shared flag).  
- Write `dataset_sft_train.jsonl`, update state registry row_count.  
- Tests for generate + feedback import.

### Do NOT edit

- `pages/test/**`, `pages/evidence/**`, `pages/tune/**`  
- `workflows._generate_believer_answer` (Tune/Test)  

---

## Feedback loop (required)

Wire UI so user understands:

1. Test **Wrong answer?** → `~/.brain-spa/.../model_feedback` (existing).  
2. Datasets **Import feedback** → new preference rows (model answer vs correction).  
3. User message: “Imported 3 corrections — rebuild adapter in Tune to apply.”

API must be idempotent-ish (don’t duplicate same feedback id).

---

## UX rules

- No harness tools/scores on home.  
- No `believer_seed` in headings — use **Believer training set** or dataset label from state.  
- Generate page ≠ chat layout; use action + progress archetype.  
- Review table: dense, scannable, not agent debug console.  
- Browser-test; `npm run build`; pytest.

---

## Believer defaults

- Pre-select Believer dataset when registry has `believer_seed`.  
- Show link: “Needs approved evidence” → `/evidence` (slug URLs) if manifest empty.  
- After generate, link: “Continue to Tune” → `/tune/believer/build`.

---

## Coordination

- If Evidence API not ready, read manifest from `~/.brain-spa/artifacts/evidence/evidence_manifest.json` with clear error in UI.  
- Export function or document dataset handoff path for **Tune agent** (`sft_handoff.json`).

---

## Definition of done

- [ ] Overview, generate, rows routes work  
- [ ] Generate uses approved evidence gate (or clear blocker message)  
- [ ] Feedback import path implemented (even if 0 records)  
- [ ] Believer display names in UI  
- [ ] Only Datasets files + App.tsx datasets routes touched  
- [ ] Build + tests pass  
- [ ] Summary: APIs, artifact paths, handoff to Tune  

Iterate until done; then stop.
