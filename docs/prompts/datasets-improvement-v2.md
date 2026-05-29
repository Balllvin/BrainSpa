# PROMPT — Datasets stage improvement (v2)

Paste into **Datasets-only** agent.

---

You are improving **Datasets** only in `/Users/alvin/Desktop/brain spa`. User likes **“Believer training set”** and the rows table; wants **more control on generate** and **DIY rows**, plus **real evidence grounding** and **Test-aligned variety**. Do not edit `pages/evidence/`, `pages/tune/`, `pages/test/`.

## Read first

- `docs/audits/datasets-stage-audit.md` (primary spec)
- `docs/audits/loop-integration-audit.md`
- `apps/api/brainspa_api/test_scenarios.py` (scenario truth)
- `apps/api/brainspa_api/datasets_workflows.py` — `_scenario_example` currently uses templates NOT claims
- `apps/web/src/pages/datasets/*`

## What to keep (good)

- Label “Believer training set”; evidence gate + link to Evidence
- Import feedback from Test; row edit/delete; scenario column; Continue to Tune; details toggle

## What to fix (required)

### 1. Generate options (critical — user control)

Replace single “Generate 24 rows” with a **control panel**:

| Control | Default | Behavior |
|---------|---------|----------|
| Row count | 24 | slider or input 4–96 |
| Scenarios | all 4 checked | counsel, advice, witness, daily-word from `test_scenarios.py` |
| Mix | even | or weights per scenario |
| Ground in approved evidence | on | when on, rows MUST use approved claim text (paraphrase); when off, template fallback with warning |

Button label reflects choices: “Generate 36 rows (witness-heavy)” not generic.

### 2. Actually ground in evidence (critical — honesty fix)

- Load approved claims from `evidence_store` / manifest
- Each row: attach `metadata.evidence_claim_ids[]` and build user/assistant text from claim + scenario template from `scenario_generation_text()` in test_scenarios
- If no approved claims: block generate (existing gate) — do not claim grounding

### 3. Manual row (critical — user DIY)

On `/datasets/believer/rows`:

- **Add row** → form: scenario dropdown, user prompt, assistant answer, optional failure labels
- POST `/api/datasets/{key}/rows`
- Appears in table immediately

### 4. Variety beyond Q&A rotation

Support row **types** per scenario:

- counsel: multi-turn optional (user message 2 lines)
- witness: challenge format
- daily-word: short output max length hint in metadata
- advice: numbered steps in assistant

Use `BELIEVER_*` constants only as fallback when evidence grounding off.

### 5. Generation preview (high)

Before writing JSONL: “Preview 2 samples” modal from same generator function with `dry_run: true` param.

### 6. Optional packs (medium)

Quick actions: “12 witness rows”, “8 daily-word shorts”, “Import Test feedback only” (no full regen).

### 7. Preference pairs (medium)

“Add correction pair” form: bad assistant vs good assistant (manual), not only import.

## API changes

Extend `DatasetGenerateRequest`: `example_count`, `scenario_keys[]`, `scenario_weights`, `ground_in_evidence: bool`, `preview_only: bool`
Add `POST /api/datasets/{key}/rows` for manual row.

## Banned

- Hardcoded `DEFAULT_ROW_COUNT = 24` only UI
- UI text “approved claims will ground rows” when using only `BELIEVER_TOPICS`

## Integration

- Import `list_test_scenarios("persona_small")` or shared `SCENARIO_ROTATION` from one module
- After generate, show scenario distribution: “counsel 6, advice 6, witness 12, daily-word 12”

## Verify

- Generate with evidence on uses real claim ids in metadata
- Manual add row works
- Test import still works
- build + pytest

Report: new controls, evidence grounding approach, sample row JSON.
