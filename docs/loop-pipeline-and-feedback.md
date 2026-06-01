# Four-stage loop, feedback, and new models

Companion: `docs/harness-and-test-ui-guide.md`, `docs/ui-ux-architecture.md`

---

## What we are building (one product, four stages)

Brain Spa changes **model behavior** through a closed loop. **Starter** (`starter_model`) is the reference model; the same pattern applies to new models.

```
Evidence → Datasets → Tune → Test
   ↑                              |
   └──────── feedback loop ───────┘
```

| Stage | Worker (agent harness) | User UI job | Primary artifacts (`~/.brain-spa/artifacts/`) |
|-------|------------------------|-------------|-----------------------------------------------|
| **Evidence** | Source Model (Grok default) | Find and approve **proof** of the behavior you want | `evidence/` — notes, claims JSONL, manifests |
| **Datasets** | Data Model (OpenCode default) | Turn approved evidence into **training rows** + preference pairs | `datasets/` — `*_sft_train.jsonl`, handoff manifests |
| **Tune** | Training Model (Codex default) | **Dry-run**, **build adapter**, register weights | `training/` — `starter_adapter`, dry_run.json, build results |
| **Test** | Harness Model | **Try** the model in real environments; say what's wrong | harness chat threads, `model_feedback` JSONL, acceptance runs |

**Test** does not train. It **proves** behavior and **feeds back** misses. **Tune** does not mine the web. **Evidence** does not score chat. Each stage has one job; handoffs are **files + registry state**, not copy-paste between pages.

---

## Starter end-to-end (reference)

| Step | Registry / keys | Artifact |
|------|-----------------|----------|
| Evidence for target behavior | sources in state | evidence notes, claims |
| Dataset | `starter_seed` | JSONL rows grounded in evidence |
| Model registry | `starter_model` | label **Starter**, base model in state |
| Tune | dataset + model | `artifacts/training/starter_validation/starter_adapter` |
| Test | slug `starter`, scenarios counsel/advice/daily-note/review | harness chat + Telegram uses same generation path |

Generation must use the **adapter** (`workflows._generate_starter_answer`), not keyword fallbacks.

---

## Feedback loop (must be wired in UI + API)

1. **Test** — User hits **Wrong answer?** → correction stored via `model_feedback.py` (and Telegram reply-to uses the same store).
2. **Datasets** — UI/API should surface “feedback queue” or “import misses from Test” → new or corrected **rows** (preference pair: bad model answer vs user correction). Agents audit with Data Model harness rules (no source copy, explicit failure label).
3. **Tune** — Re-build adapter when dataset version or row count materially changes; show **which dataset** was used on build screen.
4. **Evidence** — Only when behavior goal itself changes (new sources, new claims), not every typo fix.

User-facing copy: “Saved — will be used in the next dataset pass” not “logged to JSONL”.

---

## What Test is for (so other stages design toward it)

Test answers: **does the tuned model behave in the worlds we care about?**

- **Environments** = scenarios (`test_scenarios.py`): chat vs generate modes.
- **Probes jaggedness** — counsel vs review vs daily note; different shapes expose different failures.
- **Does not show** harness scores on primary UI; optional in artifacts for agents.
- **Output for loop**: feedback records + user judgment → Datasets stage input.

When designing Datasets rows, ask: *which Test scenario would fail if this row were missing?*  
When designing Evidence, ask: *what claim would the Review scenario need to evaluate?*

---

## New model rollout (checklist)

Use display name in UI; slug in URLs; registry `model_key` in API only.

1. **Registry** — Add `ModelProfile` in state (`apps/api/brainspa_api/state.py`): key, label, base_model, role, strengths/failures.
2. **Slug map** — `testRoutes.ts` / `tuneRoutes.ts`: e.g. `my-model` ↔ `my_model_key`.
3. **Evidence** — Create source entries + behavior goal doc; mine until claims are **approved**.
4. **Datasets** — Create dataset key, link to evidence manifest; generate rows; user curates in review UI.
5. **Tune** — Dry-run → build adapter → record `output_dir` on model profile.
6. **Test** — Add scenarios in `test_scenarios.py` for that `model_key`; environments match real use.
7. **Settings** — Stage CLIs/Telegram if needed; not on loop home.
8. **Home loop map** — Freshest artifact per stage (future); links to slug URLs.

---

## Parallel implementation (three agents)

| Agent | Owns (only edit these) | Reads, do not rewrite |
|-------|------------------------|------------------------|
| Evidence | `pages/evidence/`, `lib/evidenceRoutes.ts`, evidence API modules, `.evidence-*` CSS | `pages/test/`, `pages/datasets/`, `pages/tune/` |
| Datasets | `pages/datasets/`, `lib/datasetsRoutes.ts`, datasets API, `.datasets-*` CSS | test/, evidence/, tune/ pages |
| Tune | `pages/tune/`, `lib/tuneRoutes.ts`, tune API, `.tune-*` CSS | test/, evidence/, datasets/ pages |

**App.tsx** — Replace only your stage’s `<Route path="/STAGE" …>` block.  
**LoopPages.tsx** — Remove only your `STAGEPage` export after migration.  
**Shared** — If extracting `LoopNavArrow` from Test, put in `components/loop/LoopNavArrow.tsx` (one file, idempotent create).

**Do not** break Test routes or Starter generation while working.

---

## Stage-specific user intents (target UX)

### Evidence
- Overview: sources + status + behavior goal
- Ingest/refresh source (Grok/web/X)
- Review claims: approve / reject / flag weak provenance

### Datasets
- Overview: datasets for active model(s)
- Generate rows from **approved** evidence
- Review table: edit, delete, mark duplicate; import Test feedback batch

### Tune
- Overview: models with adapter state (ready / missing / stale)
- Build wizard: pick dataset → dry-run → build (progress, not stack traces)
- Status: last build, dataset used, acceptance pass/fail summary
- Optional: single-prompt try (not full Test replacement)

---

## Verification (full loop smoke)

1. Evidence: at least one approved claim artifact exists.
2. Datasets: `starter_seed` (or successor) row count > 0; handoff valid.
3. Tune: adapter path exists; dry-run not blocked.
4. Test: `/test/starter/review` returns real adapter text; Wrong answer? writes feedback.
5. `npm run build` + API tests green.

---

## Docs index

| Doc | Purpose |
|-----|---------|
| `harness-and-test-ui-guide.md` | UX contracts, Test reference, anti-slop |
| `loop-pipeline-and-feedback.md` | This file — loop + feedback + rollout |
| `ui-ux-architecture.md` | Product shape, workers, home page |
