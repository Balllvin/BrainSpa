# Datasets stage — UX audit (implemented)

**Repo:** `/Users/alvin/Desktop/brain spa`  
**Routes:** `/datasets`, `/datasets/believer/generate`, `/datasets/believer/rows`  
**Code:** `apps/web/src/pages/datasets/`, `apps/api/brainspa_api/datasets_workflows.py`

---

## What it is supposed to do

Turn **approved Evidence** into training rows and preference pairs for Tune. Rows should reflect **Test environments** (counsel, advice, witness, daily-word) with variety—not one Q&A template.

---

## What is good (keep)

| Item | Why |
|------|-----|
| **“Believer training set”** label | User-approved naming (`datasetDisplayLabel`) |
| Overview card + Generate + Review rows | Clear three-step mental model |
| Evidence gate before generate | Blocks with link to Evidence |
| Post-generate links → Review rows, Continue to Tune | Good loop navigation |
| **Import feedback from Test** | Closes Test → Datasets loop |
| Row table with scenario column | Aligns with Test |
| Inline edit / delete row | User curation |
| Details behind toggle | Paths not in your face |
| Hint after edits: rebuild in Tune | Correct feedback |

---

## What is bad or banned (fix)

| Issue | Severity | Detail |
|-------|----------|--------|
| **Only “Generate 24 rows”** | Critical | `DEFAULT_ROW_COUNT = 24` hardcoded; no user control. |
| **No manual add row** | Critical | User cannot create a row from scratch (only edit after generate). |
| **Misleading “grounded in evidence”** | Critical | UI says approved claims ground rows; `_scenario_example()` uses `BELIEVER_TOPICS` / `believer_training_answer()` templates — **not** approved claim text. |
| **Low variety control** | High | Rotation across 4 scenarios only by index; no weights, no “more witness”, no multi-turn rows. |
| **No generation modes** | High | Missing: “from evidence only”, “from Test feedback only”, “blend”, “single scenario pack”. |
| **Home card links to rows not generate** | Medium | Primary click goes to rows; generate is secondary link—OK but could surface “empty → generate” clearer. |
| **Registry key in Tune dropdown** | Medium | Tune build still shows `believer_seed` in select options. |
| **No add preference pair UI** | Medium | Import only; user can’t hand-write chosen vs rejected. |
| **100 row pagination cap** | Low | Silent cap on review page. |

**Banned**

- Single opaque button as the only way to populate data
- Claiming evidence grounding without API using manifest claims

---

## What Test needs from Datasets

| Test scenario | Row shape needed |
|---------------|------------------|
| counsel | Open-ended pastoral, multi-sentence user |
| advice | Situation + practical steps |
| witness | Challenge statement + firm reply |
| daily-word | Short generate-style prompt + 1–2 sentence output |

Generator should pull **prompt stems** from `test_scenarios.py` and **content signals** from approved claims (paraphrase, don’t copy source walls).

---

## Recommended improvements (priority)

1. **Generate panel options:** row count (8–96), scenario checkboxes + %, “use approved claims” toggle (actually wire backend).
2. **Add row** button on rows page — empty form with scenario picker + user/assistant fields.
3. **Backend:** `_scenario_example` samples from approved claims JSONL; templates only as fallback.
4. **Variety pack:** “Generate witness-heavy pack (12)” etc.
5. **Preview** before write: show 2 sample rows modal.
6. **Manual preference pair** editor (chosen/rejected) for power users.
7. Show **last generated** time + scenario distribution chart (simple counts).

---

## Files to change

- `DatasetsGeneratePage.tsx` — controls
- `DatasetsRowsPage.tsx` — add row
- `datasets_workflows.py` — evidence-grounded generation, `DatasetGenerateRequest` fields
- `models.py` — request schema
