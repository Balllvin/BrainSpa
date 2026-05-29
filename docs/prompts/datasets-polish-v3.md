# PROMPT — Datasets polish (v3, post-QA)

Repo: `/Users/alvin/Desktop/brain spa`  
Read: `docs/audits/final-loop-qa-audit.md`, `docs/audits/datasets-stage-audit.md`

## Context

Generate page has strong controls (slider, scenarios, preview, packs). Browser QA: **Preview/Generate disabled** without explanation while gate loads. User wants DIY + clarity.

## Keep

“Believer training set”, row slider, scenario checks, ground toggle, template warning, preview, packs, rows table, import feedback, add row form.

## Fix (required)

1. **Button disabled reasons** — Under actions, show one line: “Loading evidence gate…”, “Need approved evidence → Evidence”, or “Ready — 1 claim”. Never silent `disabled`.

2. **Generate label** — Dynamic: `Generate 36 rows · counsel 9, witness 9, …` from selection.

3. **Add row prominence** — On rows page, primary “Add row” next to import; form uses scenario select + two textareas; success toast.

4. **Manual preference pair** — If missing, add “Add correction pair” (bad vs good assistant) on rows page.

5. **Scenario fieldset** — Collapse long hints; show hint on focus only. Uppercase labels OK but one line max visible.

6. **Hub page** — Optional `/datasets/believer` mini-hub (Generate | Review rows | Import feedback) mirroring Tune/Test — avoid jumping straight to rows from home card only.

7. **Verify grounding** — With API restarted, generate with grounding ON; confirm `metadata.evidence_claim_ids` in JSONL (spot-check one row in UI details).

Only edit Datasets pages + datasets_workflows if needed.

Browser-verify: gate ready → preview enabled → generate → row appears in table.

Report.
