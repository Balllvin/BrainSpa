# Final loop QA audit (Evidence · Datasets · Tune · Test)

**Date:** 2026-05-29  
**App:** `/Users/alvin/Desktop/brain spa`  
**Methods:** Code review, live API checks, Cursor browser snapshots (Tune/Evidence/Datasets)

---

## Critical: restart the API

The process on **:8000** is serving an **older** OpenAPI (no `/api/evidence/models/{slug}`, no unified claims list, etc.). The **code** in the repo has these routes; the **running server** does not.

**Symptom:** Evidence home hides the Believer panel (`fetchEvidenceModelSummary` → 404). Datasets generate may stay disabled while the gate request fails or stalls.

**Fix:** From repo root: `npm run api` (restart). Re-check:

```bash
curl -s http://127.0.0.1:8000/api/evidence/models/believer
curl -s http://127.0.0.1:8000/api/datasets/evidence-gate
```

---

## Cross-cutting UI (Industrial Brutalist + Minimalist lens)

Brain Spa uses **tactical dark** (`tactical.css`) — closer to **Tactical Telemetry** than Swiss print.

| Rule (tactical) | Current | Verdict |
|-----------------|---------|---------|
| One accent: hazard red | Red hints + **green READY badge** | **Ban green** — use red/amber/muted only |
| 90° corners, grid lines | Picker grids use 1px grid | Good |
| No spurious “selected” state | Test hub card has **persistent red inset** | **Fix** — looks selected when idle |
| Macro title + micro meta | Believer / row counts | Good |
| Minimalist: no decorative accent | Red box on one of four equal nav tiles | **Fix** |

**Shared polish**

1. Remove `tune-picker-card--accent` persistent border; use same hover as other cards, or one **primary** CTA style only on “Build”.
2. Change `.tune-status-badge--ready` from green to muted white + red border or micro label `READY`.
3. Shell title: avoid flash **“Tune”** before **“Believer”** — use skeleton or `Believer` placeholder from slug while loading.
4. Unify hub pattern: Test `/test/believer`, Tune `/tune/believer`, future Datasets `/datasets/believer` hub — same grid, no special-case borders.

---

## Test (reference — keep)

| Good | Notes |
|------|--------|
| Slug URLs, chat UX, daily-word layout | North star |
| Wrong answer? feedback loop | Wired to Datasets import |

No major changes requested; other stages should match its navigation discipline.

---

## Evidence

### Built (v2 — in code)

- Believer-first panel, Review pending, Add claim, triage hint, ready banner → Datasets
- Unified review at `/evidence/believer/review` with filters, bulk approve, manual claim
- Other sources in `<details>`

### QA result

| Check | Result |
|-------|--------|
| Believer panel visible | **FAIL** with stale API (404 on model summary) |
| Other sources only | **Observed** in browser when summary missing |
| Add claim / unified review | **Cannot verify** until API restarted |

### Still weak (UX)

| Issue | Why it feels bad |
|-------|------------------|
| Believer panel missing when API down | Empty/confusing home — only “Other sources” |
| Too much text density in `<details>` | Industrial grid OK but copy repeats per source |
| Mine vs Review still split by source | Linked list under Believer helps; unified review is the real fix |
| No loop breadcrumb | “You are building **Believer**” once in header strip |

### Good (keep)

- `Feeds Believer training set` badge
- Approve / Weak / Reject explanation
- Collapsed other sources

---

## Datasets

### Built (v2 — in code)

- **Believer training set** label
- Row count slider 4–96, scenario checkboxes, mix/weights, ground toggle
- Preview 2 samples, quick packs, honest template-fallback warning
- Rows: Add row, Import feedback, edit/delete

### QA result (browser)

| Control | Present |
|---------|---------|
| Row slider | Yes |
| Scenario checkboxes | Yes |
| Preview / Generate | Yes (disabled until gate ready) |
| Quick packs | Yes |

### Still improve

| Issue | Detail |
|-------|--------|
| Generate disabled UX | Show **why** (loading gate vs no evidence) inline, not silent disabled buttons |
| Scenario hints in checkboxes | Dense — move hints to tooltip or one line under fieldset |
| DIY add row | In code — verify after API up |
| Manual preference pair | May still be missing — add if not present |

### Good (keep)

- Honest copy when grounding off
- Paraphrase-not-copy note
- Link to Tune after generate

---

## Tune

### Built (v2 — in code)

- `/tune/believer` hub: Build, Status, Quick try, Test environments
- Build: dataset picker with labels, dry-run, build, pre-build summary, presets (check `TuneBuildPage`)
- Stale banner, acceptance summary, try page

### QA result (browser)

| Check | Result |
|-------|--------|
| 4 hub cards | Pass |
| Title Believer | Pass (after load) |
| Test card red inset | **Visible** — matches your screenshot; should remove |

### Still improve

| Issue | Detail |
|-------|--------|
| Test environments looks “selected” | `accent: true` on Test card only |
| Green READY badge | Off-palette |
| User knobs | Add **read-only** training summary; optional Advanced preset — avoid agent-only feel |
| Hub vs Test overlap | Test card is correct link but visually deprioritize vs Build (primary path) |

### Good (keep)

- 2×2 hub (matches Test model picker pattern)
- 100 training rows meta
- Stale → Datasets links

---

## Loop integration

| Link | Status |
|------|--------|
| Evidence → Datasets gate | Works when API current |
| Datasets → Tune | Links present |
| Tune → Test | Hub card |
| Test → Datasets | Import feedback |
| Claim text → row text | Improved in code when `ground_in_evidence` — verify with restarted API |

---

## Recommended next pass (priority)

1. **Restart API** and re-run browser QA (5 min).
2. **Tune hub visual** — remove accent border; red/amber READY only.
3. **Evidence** — error banner if model summary fails; don’t show only Other sources.
4. **Datasets** — enabled state + reason text for buttons.
5. **Shared `LoopHubGrid` component** — Test/Tune/Datasets same CSS, one hover rule.

---

## Polish prompt files

- `docs/prompts/evidence-polish-v3.md`
- `docs/prompts/datasets-polish-v3.md`
- `docs/prompts/tune-polish-v3.md`
