# Tune stage — UX audit (implemented)

**Repo:** `/Users/alvin/Desktop/brain spa`  
**Routes:** `/tune`, `/tune/believer/build`, `/tune/believer/status`, `/tune/believer/try`  
**Code:** `apps/web/src/pages/tune/`, existing training APIs

---

## What it is supposed to do

Dry-run, build LoRA adapter, surface readiness/staleness, link to Test. Heavy work stays backend; user sees **progress and decisions**.

---

## What is good (keep)

| Item | Why |
|------|-----|
| Model overview with adapter state badge | Clear ready/missing/stale |
| **Stale banner** + rebuild link | Connects Datasets changes → retrain |
| Build wizard steps (Dataset → Dry-run → Build) | Logical order |
| Dry-run before build enforced | Prevents blind failures |
| Plain English `formatMissingRequirements` | Not raw stack traces |
| Status page: Pass / Needs work acceptance | User-level summary |
| Expandable acceptance cases | Optional depth |
| **Test Believer** CTA after build | Loop closure |
| Quick try page | Smoke test without full Test |
| Slug `believer` in URLs | Consistent |
| Loss/rows/steps on success | Enough signal without jargon |

---

## What is bad or banned (fix)

| Issue | Severity | Detail |
|-------|----------|--------|
| **Agent-first, user-second** | High | User can only pick dataset + click Dry-run/Build; no training knobs (epochs, rank, LR) even as “Advanced”. |
| **Dataset select shows registry keys** | Medium | `believer_seed` in option text |
| **Build blocks UI thread** | Medium | Long build with only button label change; no progress % or cancel |
| **Try page not linked from model hub** | Medium | User may miss `/tune/believer/try` |
| **No “what will change” preview** | Medium | Before build: row count, dataset version, last build diff |
| **Acceptance artifact path visible** | Low | Slop for primary UI (ok in details) |
| **No user-triggered partial actions** | Medium | e.g. “Validate handoff only”, “Probe adapter load” without full train |

**Banned**

- Harness tool list on Tune home (absent — good)
- Full eval dump as default view (mostly avoided)

---

## User vs agent split (target)

| User should do | Agent/backend should do |
|----------------|-------------------------|
| Pick dataset, confirm build | Write trainer recipes, run TRL/PEFT |
| Choose advanced training preset (optional) | Download weights |
| Run acceptance when ready | Score cases, write artifact |
| Quick try prompt | Load adapter, generate |
| Read stale warning | Compare dataset hash |

---

## Recommended improvements (priority)

1. **Believer model hub** (`/tune/believer`) — cards: Build, Status, Quick try, Test (like Test environments).
2. **Display labels** in dataset select — “Believer training set (24 rows)”.
3. **Advanced collapsed** — epochs/steps preview (read-only defaults first).
4. **Build progress** — poll job or staged status text.
5. **Pre-build summary card** — dataset rows, scenarios breakdown, last build date.
6. Link **Import feedback → Datasets** from stale banner when feedback imported but not rebuilt.

---

## Files to change

- `TuneModelPage.tsx` (may exist via routes), `TuneHomePage.tsx`, `TuneBuildPage.tsx`
- `tuneDisplay.ts`, optional job status API
