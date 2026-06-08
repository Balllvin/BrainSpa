# Harness And Test UI Guide

The Test stage proves behavior inside environments. It is not a dashboard for registry keys, tools, or agent internals.

## Two Layers

| Layer | Audience | Job |
|-------|----------|-----|
| Harness backend | Workers and models | Own world state, actions, tools, scoring, artifacts |
| Test UI | Human operator | Run the environment, read state, correct course |

Do not mix those layers. Humans should operate outcomes. Agents can inspect metadata.

## Snake Quality Bar

Use `/test/snake/autonomous-train` as the reference surface for future Test pages.

It works because:

- all boards are visible immediately
- the primary Run/Stop control is obvious
- speed and run count controls are close to the action
- stats sit beside the controls they explain
- each board is compact and unframed
- metrics are labeled and meaningful
- the page does not explain itself with marketing copy
- the environment is usable before any model has been trained

## Scenario Archetypes

| Archetype | Use when | Snake example |
|-----------|----------|---------------|
| Overview | Pick a model or environment | `/test`, `/test/snake` |
| Parallel lab | Multiple workers/worlds run together | `/test/snake/autonomous-train` |
| Watch | A trained or baseline policy acts alone | `/test/snake/autonomous-watch` |
| Manual play | Human action input matters | `/test/snake/human-play` |
| Coach replay | Past run is inspected step-by-step | `/test/snake/coach-replay` |
| Arena | Two actors share a world | `/test/snake/human-vs-ai`, `/test/snake/dual-arena` |
| Chat | Text behavior is the environment | Future language-model harnesses |
| Generate | One-shot output is enough | Future language-model harnesses |

Choose the archetype first, then build the route. Do not force every environment into chat or cards.

## UI Rules

- One primary control per page.
- Put controls and their metrics together.
- Show useful state before the user starts a run.
- Use legends, labels, and metrics instead of long explanatory text.
- Keep route slugs human-facing and map them to registry keys in one route helper.
- Do not show registry keys as primary labels.
- Do not commit generated screenshots from browser verification.
- Keep old routes as redirects only when they protect real links.

## Backend Contract

Every environment endpoint should expose:

- scenario key
- world state
- legal actions
- current score/reward components
- terminal/failure state
- artifact path when a run writes local output

For policy environments, dataset export should append transitions or trajectories under `~/.brain-spa/artifacts/datasets/`.

For language-model environments, feedback should append corrections or preference candidates under runtime artifacts for Datasets to consume later.

## Anti-Slop Checklist

- [ ] Page has one clear job.
- [ ] Empty state is real, not filler copy.
- [ ] Primary action is visually obvious.
- [ ] Metrics are named, not placeholder zeros.
- [ ] Generated artifacts stay in runtime state.
- [ ] Tests cover scenario separation and unknown-model 404s.
- [ ] Browser smoke verifies the visible page.
