# Evidence stage — UX audit (implemented)

**Repo:** `/Users/alvin/Desktop/brain spa`  
**Routes:** `/evidence`, `/evidence/sources/:slug`, `/evidence/:slug/review`  
**Code:** `apps/web/src/pages/evidence/`, `apps/api/brainspa_api/evidence_store.py`

---

## What it is supposed to do

Find and **approve proof** of target behavior before Datasets writes rows. For Believer: cited, specific faith/persona claims—not generic assistant tone.

---

## What is good (keep)

| Item | Why |
|------|-----|
| Section root `/evidence` has no “back to Chipmunk” | Matches loop UX rules |
| Arrow-only back on subpages (`EvidenceShell`) | Consistent with Test |
| Slug URLs (`believer`, not `believer_voice_refs`) | Human-readable |
| Review actions: Approve / Weak / Reject | Clear triage |
| Per-claim citation line | Supports provenance goal |
| Ingest focus textarea | User can steer mining pass |
| Counts on home (`N approved · M pending`) | Useful at a glance |
| Solo grid when one source | No empty column |

---

## What is bad or banned (fix)

| Issue | Severity | Detail |
|-------|----------|--------|
| **No “which model am I building?”** | Critical | Home lists **all** sources (Believer, Composer interview, recovery commits) with equal weight. User must guess which source applies to Believer training. |
| **Source ≠ model mapping invisible** | Critical | `evidenceRoutes` maps slugs but UI never says “This feeds Believer training set” on the right card. |
| **Review is per-source maze** | High | User must pick source → mine → review → repeat for 3 sources. No unified **Believer evidence inbox** with filter Pending. |
| **No manual claim entry** | High | User cannot add their own claim/citation (only automated ingest). Product ask: “do it myself.” |
| **Ingest opaque** | Medium | “Mine source” / “Refresh from web/X” — unclear what will appear; no preview of query/plan. |
| **No bulk actions** | Medium | Approving 20 claims one-by-one is tedious. |
| **Weak vs Reject unclear** | Medium | No short copy on what happens downstream (Datasets uses **approved only**). |
| **No progress toward gate** | Medium | Datasets needs `approved_count > 0`; Evidence should show “Ready for Datasets” banner when gate passes. |
| **Behavior focus duplicated** | Low | Global focus on home + per-source ingest; confusing which wins. |

**Banned patterns (do not reintroduce)**

- Harness `tools:` / `scores:` on Evidence home (currently absent — good)
- Registry keys in titles (mostly absent)
- Treating all sources as one pipeline without model context

---

## Gap vs loop

- Datasets gate checks **total** approved claims across manifest, not per-model dataset.
- Generated rows claim `source: approved_evidence` but generator still uses **template topics** (`BELIEVER_TOPICS`), not approved claim text — Evidence feels disconnected from Datasets (see Datasets audit).

---

## Recommended improvements (priority)

1. **Believer-first home** — Primary card: “Believer behavior evidence” with linked source(s), pending count, CTA Review. Other sources under “Other sources” collapsed.
2. **Unified review** — `/evidence/believer/review` OR filter=all sources tagged `feeds: believer_seed`.
3. **Manual add claim** — form: claim text + citation + source; status pending.
4. **Filters** — Pending | Approved | Rejected | Weak; sort oldest first.
5. **Bulk approve** pending with citation present.
6. **Ready banner** — “12 approved — you can generate training rows in Datasets →”
7. **Optional:** show which Test scenarios this evidence supports (counsel, witness, …).

---

## Files to change

- `EvidenceHomePage.tsx`, `EvidenceReviewPage.tsx`, new `EvidenceAddClaimPage` or inline form
- `evidence_store.py` — POST claim, list with filters, source↔model tags in state
- `evidenceRoutes.ts` — believer-centric paths if needed
