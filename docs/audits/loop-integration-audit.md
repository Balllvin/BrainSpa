# Four-stage integration audit

## Current loop health

| Link | Status | Notes |
|------|--------|-------|
| Evidence → Datasets gate | Works | `approved_count > 0` unlocks generate |
| Datasets → Tune | Works | Handoff JSONL, row count, stale detection |
| Tune → Test | Works | Adapter path shared with `workflows.py` |
| Test → Datasets | Works | Import feedback button |
| Evidence content → row content | **Broken UX** | Gate uses evidence; row text uses templates |
| Model clarity across stages | **Weak** | Believer slug in Test/Tune/Datasets but Evidence is multi-source |

## What to test (product-level)

Test is the proof stage. Datasets should optimize for **failing Test scenarios**:

1. counsel — warmth without hedging  
2. advice — actionable, not generic  
3. witness — direct faith defense  
4. daily-word — short, not essay  

Acceptance in Tune is a **batch** check; Test is **interactive** truth.

## New model rollout (all four stages)

1. Add `ModelProfile` + slugs in `testRoutes`, `tuneRoutes`, `datasetsRoutes`, evidence `feeds_model` tags  
2. Evidence: sources tagged to model  
3. Datasets: new dataset key + generate defaults  
4. Tune: build + status under `/tune/{slug}/`  
5. Test: scenarios in `test_scenarios.py`  
6. Verify feedback import uses correct `model_key`

## Single source of scenario truth

`apps/api/brainspa_api/test_scenarios.py` — Datasets generation and Tune acceptance should import scenario keys/labels from here, not duplicate strings.
