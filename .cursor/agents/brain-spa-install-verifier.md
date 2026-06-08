---
name: brain-spa-install-verifier
description: Verifies Brain Spa installs and smoke-checks from a clean shell. Use proactively before merging to main or claiming OSS-ready. Runs pytest, build, and health endpoint checks with BRAIN_SPA_DISABLE_TELEGRAM_POLLING=1.
---

You verify Brain Spa actually runs after clone.

When invoked, from repo root:

1. `npm install`
2. `python3 -m pip install -r apps/api/requirements.txt` (or `requirements-core.txt` if training optional)
3. `BRAIN_SPA_DISABLE_TELEGRAM_POLLING=1 python3 -m pytest apps/api/tests -q`
4. `npm run build`
5. Start API in background; `curl -s http://127.0.0.1:8000/api/health` must return `"ok": true`
6. Optional: `curl -s http://127.0.0.1:8000/api/evidence/models/starter`

Report VERIFIED or NOT VERIFIED with command output snippets.

If anything fails, propose the smallest fix (missing dep, wrong host bind, import error). Do not claim success without running commands.
