# Loop stages: agent harness (backend) and user UI (frontend)

Reference stage: **Test** (`/test`) — replicate these patterns on **Evidence**, **Datasets**, and **Tune**.

---

## Two layers (do not mix them in the UI)

| Layer | Who it is for | What it does | Where it lives |
|--------|----------------|--------------|----------------|
| **Agent harness (backend)** | Coding agents, CLIs, Telegram stage bots | Mine, score, train, eval, write artifacts, run long jobs | `apps/api/brainspa_api/`, `~/.brain-spa/artifacts/`, Settings → Harnesses (`/settings/agents`) |
| **User UI (frontend)** | Human operator | Pick intent, trigger work, read outcomes, correct lightly, move on | `apps/web/src/pages/<stage>/`, `tactical.css` |

You had this right:

- **Frontend** = full experience of useful features (test a model, approve a row, kick off a build).
- **Backend** = agents and API doing the hard work **and** processing user actions (send chat, save feedback, generate dataset rows).

The user should **not** operate the harness like an agent (registry keys, tool lists, scoring rules on the main page). They should operate **outcomes** (counsel chat, “generate sample rows”, “build adapter”). Agents use the harness metadata; humans use stage-specific screens.

---

## Product principles

1. **User tests and steers; AI works in the back end**  
   Eval scores, adapter paths, `starter_model`, harness tool lists stay off primary UI. Show **Starter**, not registry keys.

2. **One page archetype per job** — not one layout for every stage.  
   | Archetype | When | Test example |
   |-----------|------|----------------|
   | **Overview** | Pick model / source / dataset | `/test`, `/test/starter` |
   | **Chat** | Multi-turn try-out | counsel, advice, review |
   | **Generate** | One primary action, big result | daily word |
   | **Action + list** | Run job, see registry summary | Datasets today (improve) |
   | **Wizard / form** | Parameters then run | Tune today (improve) |
   | **Review** | Approve/reject rows, edits | Evidence / Datasets (target) |

3. **URLs match what the user sees**
   Slugs in the path (`/test/starter/advice`). Map slugs ↔ registry keys in one module per stage (`testRoutes.ts`). Redirect legacy keys.

4. **Navigation is minimal**
   - Stage home (`/test`, `/evidence`, …) = **section root** — no “back to Chipmunk”.  
   - Deeper pages: **arrow only**, top-left (`TestNavArrow`). No “← Starter” text.
   - Hints on list cards, not duplicated in chat header.

5. **Feedback is lightweight**
   “Wrong answer?” → correction → shared store (`model_feedback.py`). Hover → red. No eval panel on Test.

6. **Multiple environments probe capability**
   Different shapes reveal jaggedness through use, not dashboard scores.

7. **Optimistic, chat-native UX** (all chat archetypes)
   See [Chat UX contract](#chat-ux-contract) below — required on every chat page.

---

## Test route map (reference)

| URL | Archetype | Purpose |
|-----|-----------|---------|
| `/test` | Overview | Pick tuned model (no back link) |
| `/test/starter` | Overview | Pick environment |
| `/test/starter/counsel` | Chat | Multi-turn |
| `/test/starter/daily-word` | Generate | One-shot word |
| `/test/starter/review` | Chat | Answer review / specificity |

Registry: `starter_model` ↔ slug `starter`. API calls use `model_key`; routes use slugs only.

---

## Backend harness contract (Test)

Use this pattern when adding stage APIs.

| Piece | File | Role |
|-------|------|------|
| Scenario registry | `test_scenarios.py` | `key`, `label`, `mode` (`chat` \| `generate`), `placeholder`, `hint` — **drives frontend branch** |
| Threads | `harness_chat.py` | Per `(model_key, scenario_key)` messages; `Generate` for one-shot |
| Generation | `workflows.py` | Real adapter output (`_generate_starter_answer`); multi-turn = last N turns |
| Feedback | `model_feedback.py` | Corrections / reply-to-message → JSONL for tuning |
| Routes | `main.py` | `GET /api/harness/scenarios/{model_key}`, `GET/POST` harness chat |
| Paths | `config.py` | `harness_chat_path`, `model_feedback_path` under `~/.brain-spa/` |

**Rules for new backend work**

1. Scenario `mode` must match UI archetype (never force generate flows into chat layout).
2. Generation must use the real model path, not keyword fallbacks.
3. Persist threads and feedback under `BRAIN_SPA_HOME` for agents to consume later.
4. Return stable message `id`s for reply-to / “Wrong answer?”.
5. Keep agent-only fields in API responses optional; frontend filters `system` and internal `Generate` user stubs.

**Evidence / Datasets / Tune backend (to build or extend)**

- **Evidence**: source ingest status, grok/mining job handles, artifact paths — not raw CLI stdout on the main page.
- **Datasets**: row preview, manifest paths, generation params — hide forge jargon.
- **Tune**: dry-run / build / acceptance as async-capable endpoints; return human summaries + artifact paths, not stack traces in UI.

Stage CLI/Telegram routing stays in Settings; loop pages call HTTP API only.

---

## Frontend structure (Test — copy this shape)

```
apps/web/src/
  lib/
    testRoutes.ts              # slug ↔ model_key, path helpers
    testScenarios.ts           # display names, FALLBACK_SCENARIOS
    backend.ts                 # fetchHarnessChat, sendHarnessChatMessage, …
  pages/test/
    TestHomePage.tsx           # overview, no back
    TestModelPage.tsx          # environment list
    TestEnvironmentPage.tsx    # mode router (chat | generate)
    TestChatEnvironment.tsx    # chat archetype
    TestGenerateEnvironment.tsx
    TestChatShell.tsx / TestShell.tsx / TestNav.tsx
    TestChatTyping.tsx
    useHarnessEnvironment.ts   # shared send/load/optimistic state
```

**CSS** (`tactical.css`): `.test-stage`, `.test-chat-stage`, `.test-generate-stage`, `.test-nav-arrow`, `.test-picker-grid--solo`, `.test-scenario-hint`, `.test-chat-typing` + `@keyframes test-chat-typing-bounce`.

---

## Chat UX contract

Applies to **every** chat environment (Test now; Evidence/Datasets/Tune if they add chat).

| Rule | Implementation |
|------|----------------|
| No header “Thinking…” | Removed from `TestChatShell`; never put status in top bar |
| Optimistic user bubble | On send: clear input immediately; append pending user message (`pendingUserText` in `useHarnessEnvironment`) |
| Typing on the left | `TestChatTyping` — three animated dots in assistant row **below** user bubble |
| Thread from top | `.test-chat-messages--thread`; empty state only when no messages |
| Input not stuck | `setDraft("")` at start of `send()`; restore draft only on error |
| Send disabled while busy | Submit disabled; input stays typable for next message |
| User right, assistant left | `.test-chat-message--user` / `--assistant` |
| Wrong answer? | On assistant bubbles only; not on optimistic pending bubble |
| Scroll | `scrollIntoView` on `displayMessages` + `awaitingReply` changes |

**Do not**

- Center “Thinking…” in the main area while the composer still holds the sent text.
- Show duplicate thinking indicators (header + center).
- Block the whole composer with `disabled={busy}` on the input (only disable send).

---

## Generate UX contract (Test daily word)

| Rule | Implementation |
|------|----------------|
| No chat composer as primary | Full-width CTA: “Get today’s word” / “Another word” |
| Result centered, large type | `.test-generate-word` |
| Arrow top-left only | `TestGenerateEnvironment` topbar |
| Wrong answer? on result | Same feedback path as chat |
| No centered “Thinking…” as main content | Short lead text or inline busy on CTA |

---

## Overview / list UX contract

| Rule | Test |
|------|------|
| Section root has no parent back | `/test` |
| Single card ≠ two-column grid with empty cell | `.test-picker-grid--solo` |
| Scenario hints small, tight | `.test-scenario-hint` ~0.78rem |
| Display names, not keys | `modelDisplayName()` → Starter |
| List not oversized red blocks | `.test-scenario-list` rows |

---

## Anti-slop checklist (UI + harness)

**Navigation & chrome**

- [ ] No “back to Chipmunk” on `/evidence`, `/datasets`, `/tune`, `/test`.
- [ ] Back = arrow only, top-left.
- [ ] No `CHAT`, `ONE TAP`, or stage kickers in user-facing titles.

**Copy & naming**

- [ ] No registry keys (`starter_model`, `starter_seed`) in primary labels.
- [ ] No `tools:` / `scores:` harness cards on loop home (move to Settings or agent docs).
- [ ] No `Stage harness` link as the main CTA on the stage home.

**Layout**

- [ ] Page archetype matches the job (chat ≠ generate ≠ agent dashboard).
- [ ] Solo lists/grids don’t leave gray dead columns.
- [ ] Red accent for hints, not huge warning blocks.

**Interaction**

- [ ] Chat uses optimistic send + left typing dots (not text “Thinking…” in header).
- [ ] Long API calls: disable action button, show inline/busy on the control — not a global mystery state.
- [ ] Errors near the control that failed; restore user input when possible.

**Backend**

- [ ] User actions hit real model/adapter paths.
- [ ] Feedback and artifacts persisted for agents.
- [ ] Scenario metadata drives UI mode.

---

## Rollout blueprint: Evidence, Datasets, Tune

Current loop pages (`LoopPages.tsx`) are **agent-facing slop** (harness card, `stageKey`, tool lists). Replace with Test-style structure **per stage**, not a copy of Test’s chat.

### Evidence (suggested)

| User intent | Archetype | Example URL | Backend (agent) |
|-------------|-----------|-------------|-----------------|
| See what sources exist | Overview | `/evidence` | Registry in state; ingest jobs |
| Add / refresh a source | Form or wizard | `/evidence/sources/:slug` | Grok/mining CLI via API |
| Review captured proof | Review / timeline | `/evidence/:source/review` | Artifacts under `artifacts/evidence/` |

`evidenceRoutes.ts` — slug ↔ source keys. No Chipmunk back link.

### Datasets (suggested)

| User intent | Archetype | Example URL | Backend (agent) |
|-------------|-----------|-------------|-----------------|
| Pick dataset | Overview | `/datasets` | Registry |
| Generate training rows | Action + progress | `/datasets/:slug/generate` | `generateDataset` API |
| Curate / delete bad rows | Review table | `/datasets/:slug/rows` | JSONL + agent curation |

Hide `manifest_path` behind “View details” or Settings; show row count and quality summary on main path.

### Tune (suggested)

| User intent | Archetype | Example URL | Backend (agent) |
|-------------|-----------|-------------|-----------------|
| Pick model to train | Overview | `/tune` | Model registry |
| Dry-run / build adapter | Wizard | `/tune/starter/build` | training APIs |
| Quick smoke test | Chat or single prompt | `/tune/starter/try` | adapter test endpoint |
| Acceptance | Results summary | `/tune/starter/status` | acceptance run — scores for user as pass/fail summary only |

Display **Starter** in UI; `starter_model` only in API payloads.

### Shared front-end module pattern (per stage)

```
pages/<stage>/
  <Stage>HomePage.tsx
  <Stage>Shell.tsx
  <Stage>Nav.tsx          # arrow-only back
lib/
  <stage>Routes.ts        # slugs, redirects
  <stage>Scenarios.ts     # if multiple sub-intents
```

Reuse CSS prefixes or generalize to `.loop-stage`, `.loop-chat-stage` once a second stage lands — avoid duplicating 500 lines; extract shared chat shell from Test when building Tune “try” chat.

### Shared backend pattern (per stage)

1. `*_scenarios.py` or stage registry — metadata list with `mode` for UI.
2. Stage-specific workflow module — heavy work.
3. Thin routes in `main.py` — JSON in/out, no CLI parsing in React.
4. Artifacts under `~/.brain-spa/artifacts/<stage>/`.

---

## Verification before handoff

1. `npm run api` + `npm run dev` → `http://127.0.0.1:5173`
2. Browser pass all routes for the stage.
3. Chat: send message → bubble right → dots left → reply; no header thinking; input clears.
4. `cd apps/web && npm run build`
5. `cd apps/api && pytest` (if API touched)
6. Optional: Playwright screenshot of home + one deep route.

---

## File index (Test — ground truth)

| Concern | Path |
|---------|------|
| Guide | `docs/harness-and-test-ui-guide.md` |
| Routes | `apps/web/src/lib/testRoutes.ts` |
| Chat hook | `apps/web/src/pages/test/useHarnessEnvironment.ts` |
| Scenarios API | `apps/api/brainspa_api/test_scenarios.py` |
| Chat persistence | `apps/api/brainspa_api/harness_chat.py` |
| Starter generation | `apps/api/brainspa_api/workflows.py` |
| Feedback store | `apps/api/brainspa_api/model_feedback.py` |
| Styles | `apps/web/src/styles/tactical.css` (`.test-*`) |

---

## Full loop, feedback, new models

See **`docs/loop-pipeline-and-feedback.md`** — four-stage handoffs, Starter reference path, Test→Datasets feedback, new model rollout checklist, parallel agent file boundaries.

## Stage audits (post-v1 implementation)

| Stage | Audit |
|-------|--------|
| Evidence | `docs/audits/evidence-stage-audit.md` |
| Datasets | `docs/audits/datasets-stage-audit.md` |
| Tune | `docs/audits/tune-stage-audit.md` |
| Integration | `docs/audits/loop-integration-audit.md` |

## Improvement prompts (v2 — use now)

| Stage | Prompt file |
|-------|-------------|
| Evidence | `docs/prompts/evidence-improvement-v2.md` |
| Datasets | `docs/prompts/datasets-improvement-v2.md` |
| Tune | `docs/prompts/tune-improvement-v2.md` |

Initial rollout prompts: `docs/prompts/*-parallel-agent.md`
