# PROMPT — Evidence polish (v3, post-QA)

Repo: `/Users/alvin/Desktop/brain spa`  
Read: `docs/audits/final-loop-qa-audit.md`, `docs/audits/evidence-stage-audit.md`

## Context

v2 Evidence is in the codebase but **QA showed the Believer panel missing** when `/api/evidence/models/believer` 404s (stale API). Polish UX so the page never looks “empty except Other sources.”

## Keep

Believer panel, unified `/evidence/believer/review`, Add claim, bulk approve, triage hint, ready banner, collapsed other sources.

## Fix (required)

1. **API failure state** — If `fetchEvidenceModelSummary` fails, show a clear banner: “Evidence API out of date — restart with `npm run api`” AND still render Believer shell with Review/Add links (degraded mode using manifest/claims endpoints that exist).

2. **Believer strip always visible** — Top of `/evidence`: fixed strip “Building: Believer” + pending/approved counts from `/api/evidence/claims?model=believer` fallback if summary route fails.

3. **Reduce noise** — Other sources: one line per source in details, not full cards unless expanded.

4. **Review UX** — Filter tabs as horizontal micro labels (PENDING / APPROVED / WEAK / REJECT), not wall of red. Bulk approve sticky footer when pending > 0.

5. **Industrial palette** — No green; red only for actionable/warn. Match `tactical.css`.

6. **Browser verify** after `npm run api`: Believer panel, Add claim, Review pending, ready banner when 1+ approved.

Only edit Evidence pages + evidence API if needed for fallback endpoint.

Report screenshots paths and API routes tested.
