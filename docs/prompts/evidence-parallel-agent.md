# PROMPT 1 of 3 — Evidence stage (parallel agent)

Paste everything below into a **dedicated agent** (Evidence only). Two other agents run Datasets and Tune at the same time; do not wait for them, but **do not edit their files**.

---

## Mission

Rebuild **Evidence** (`/evidence`) in `/Users/alvin/Desktop/brain spa` as a **user-facing** stage that fits the four-part loop **Evidence → Datasets → Tune → Test**. Evidence is where humans and the Source Model **find and approve proof** of the behavior we want (for Believer: blunt faith/persona voice grounded in real sources—not generic assistant tone).

**Read completely before coding:**

1. `docs/loop-pipeline-and-feedback.md` — loop handoffs, feedback, Believer reference, parallel file boundaries  
2. `docs/harness-and-test-ui-guide.md` — backend vs frontend, archetypes, anti-slop, chat UX if you add chat  
3. `docs/ui-ux-architecture.md` — workers, harness definition, page requirements  
4. Test reference UI: `apps/web/src/pages/test/`, `apps/web/src/lib/testRoutes.ts`  
5. Current slop to replace: `apps/web/src/pages/LoopPages.tsx` → `EvidencePage` only  
6. Harness metadata (agent-only): `apps/api/brainspa_api/state.py` harness `evidence` — do **not** paste tools/scores on the user home page  

**Runtime:** `BRAIN_SPA_HOME` = `~/.brain-spa/`; artifacts `artifacts/evidence/`. Dev: `http://127.0.0.1:5173`, API `npm run api`.

---

## Your place in the loop

| You consume | You produce | Downstream |
|-------------|-------------|------------|
| User-defined behavior goal, source registry | Approved claims, evidence notes, manifests | **Datasets** reads approved evidence → JSONL rows |
| — | Provenance + citation quality | **Test** Witness/counsel scenarios assume claims exist |
| Test feedback (optional v2) | New evidence tasks when behavior goal shifts | **Tune** does not use Evidence directly |

**Good evidence for Believer:** specific behavior claims, cited, not polished corporate copy; transcript-style blunt examples preferred per product prefs in `AGENTS.md`.

**Bad evidence:** vague “be helpful”, uncited claims, copied source walls.

---

## Deliverables

### Frontend (you own)

- `apps/web/src/pages/evidence/` — new pages, not one `LoopShell` dashboard  
- `apps/web/src/lib/evidenceRoutes.ts` — slug ↔ `source.key` in state  
- **Routes (implement):**

| URL | Archetype | User job |
|-----|-----------|----------|
| `/evidence` | Overview | List sources + behavior focus; freshest artifact line per source; **no back to Chipmunk** |
| `/evidence/sources/:slug` | Form/wizard | Add or refresh source (Grok/web/X via API); show job progress on button, not header “Thinking…” |
| `/evidence/:slug/review` | Review | Browse claims/notes; **approve / reject / flag weak**; drives what Datasets may use |

- Navigation: **arrow only**, top-left on subpages (copy `TestNavArrow` → `components/loop/LoopNavArrow.tsx` if missing; idempotent).  
- CSS: `.evidence-*` in `tactical.css` only (do not rename `.test-*`).  
- **App.tsx:** replace **only** `<Route path="/evidence" …>` and add child routes; leave `/test`, `/datasets`, `/tune` untouched.  
- Remove `EvidencePage` from `LoopPages.tsx` when done.

### Backend (you own)

- New modules e.g. `evidence_workflows.py`, routes in `main.py` under `/api/evidence/…`  
- Persist: `evidence_notes.json`, `source_claims.jsonl`, `evidence_manifest.json` (align with harness `template_artifacts` in state).  
- Endpoints (minimum): list sources, get source detail, start ingest job, list claims with approval state, PATCH approve/reject claim.  
- Return summaries for UI; raw paths behind “Details” if needed.  
- Tests in `apps/api/tests/` for new routes.

### Do NOT edit

- `apps/web/src/pages/test/**`  
- `apps/web/src/pages/datasets/**` (other agent)  
- `apps/web/src/pages/tune/**` (other agent)  
- `workflows.py` Believer generation unless adding a shared helper you export cleanly  

---

## UX rules (non-negotiable)

- No harness card with `tools:` / `scores:` on `/evidence`.  
- No registry keys in titles; use source **labels**.  
- Section root `/evidence` has **no** parent back link.  
- Page archetype ≠ Test chat unless you add a deliberate “interview” chat; default Evidence is **review + ingest**, not Grok chat clone.  
- If you add chat: full **Chat UX contract** from harness guide (optimistic bubble, typing dots left, no header Thinking).  
- Browser-test every route with API running before done.  
- `cd apps/web && npm run build`; pytest if API changed.

---

## Believer alignment

- Default sources in state should be visible on overview.  
- Review UI should make it obvious which claims are **approved for dataset generation** (badge or filter).  
- Copy example: “Approved for training” / “Needs source” — not “SFT handoff pending”.

---

## Coordination hooks for other agents

- Expose stable API: `GET /api/evidence/approved-claims` or manifest flag `approved: true` so **Datasets agent** can call without reading your React code.  
- Document in code comment at top of `evidenceRoutes.ts`: manifest path pattern under `~/.brain-spa/artifacts/evidence/`.

---

## Definition of done

- [ ] Three routes work in browser  
- [ ] At least one claim can be approved and persists across refresh  
- [ ] No slop from old `LoopShell` on Evidence  
- [ ] App.tsx only touched for Evidence routes  
- [ ] Build + tests pass  
- [ ] Short summary: routes, APIs, artifact paths, what Datasets should call next  

Iterate until the above is true; then stop and report.
