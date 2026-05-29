# PROMPT — Tune polish (v3, post-QA)

Repo: `/Users/alvin/Desktop/brain spa`  
Read: `docs/audits/final-loop-qa-audit.md`, user screenshot of `/tune/believer` hub

## Context

Tune hub works (4 cards, Believer title, READY, row count). User flagged UI like screenshot: **Test environments tile has red border** while others don’t — looks wrongly selected. Green READY badge breaks tactical palette.

## Keep

Hub layout, Build wizard, stale banner, status/acceptance, quick try, Test link, dataset display labels in build.

## Fix (required)

1. **Remove `tune-picker-card--accent`** from Test environments card in `TuneModelPage.tsx` — all four tiles identical at rest; red inset **only on :hover** (same as siblings).

2. **READY badge** — Change `.tune-status-badge--ready` from green to neutral text + subtle border (or red micro-accent). One accent color system-wide.

3. **Loading title** — `TuneShell` title: use slug display name (“Believer”) immediately; swap to API display name when loaded. No flash “Tune”.

4. **Primary emphasis** — Make **Build** the visual primary (solid border or first in reading order); Test environments is secondary navigation to another stage — same weight as Quick try.

5. **Optional shared component** — Extract `LoopHubGrid` from tune/test pickers for consistent 2×2 grid (no stage-specific accent hacks).

6. **Build page user copy** — At top: “You train; the agent runs the recipe.” Advanced preset collapsed. Pre-build summary always visible when dataset selected.

Browser-verify `/tune/believer`: no red box on Test tile at idle; Believer title on first paint; hover red on all cards.

Only edit Tune pages + `tactical.css` tune-* rules.

Report before/after description.
