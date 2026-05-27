# Brain Spa UI/UX Architecture

Brain Spa is a local app for changing model behavior. The model gets worked on in a loop:

1. Evidence
2. Datasets
3. Tune
4. Test

Everything in the interface must support that loop.

Chipmunk is the JARVIS-like operator inside Brain Spa. It is the visible intelligence that helps run the loop for training and tuning user-owned models. Do not present Chipmunk as a mascot or chat gimmick; present it as the operating core.

## Product Shape

Brain Spa has four resident model workers:

| Worker | Job | Memory |
| --- | --- | --- |
| Source Model | Finds evidence for the behavior the user wants. | Sources, notes, transcript references, failure examples. |
| Data Model | Turns evidence into datasets. | Generated rows, preference pairs, warnings, handoff files. |
| Training Model | Fine-tunes and checks local training readiness. | Dry-runs, adapter artifacts, missing modules, model states. |
| Harness Model | Builds environments and tests behavior. | World state, tools, allowed actions, scoring rules, eval comments. |

Each worker is focused on one part of the loop, but can read the other loop artifacts.

## Harness Definition

A harness is the world and toolset an AI works inside.

For Brain Spa workers, a harness gives the worker enough room to do its job without forcing a single canned output.

For models created by Brain Spa, a harness is the environment used to test whether the model actually behaves correctly.

Every harness must define:

- world state
- allowed actions
- available tools
- scoring rules
- failure comments

## Navigation

The header must show the loop, in this order:

1. Evidence
2. Datasets
3. Tune
4. Test
5. Settings

The brand returns to the home loop map.

Do not put one-off demos in the top navigation. A chess harness can exist inside Test. It is not the product.

## Home Page

The home page is the loop map.

Use a central reactive Chipmunk arc-reactor core with four equal loop parts around it. The reactor should read like a Tony Stark/JARVIS-style operating core translated into Brain Spa colors: graphite, red heat, amber energy, sharp telemetry. It should use layered block machinery, centered depth, active energy that fills the reactor, and no drawn outer ring. Each loop part shows:

- the part name
- the freshest useful state
- the worker responsible
- one short line about what happens there

Use little text. Prefer strong labels and live state over explanation.

The reactor is allowed to use radial and conic energy gradients because it is the product signal. Do not spread that effect across the rest of the UI.

## Page Requirements

Evidence page:

- shows active sources and what behavior evidence they support
- helps collect proof before rows are generated

Datasets page:

- generates rows from evidence
- shows row counts, warnings, handoff files, and dataset state

Tune page:

- runs training dry-runs
- builds adapters
- tests the adapter
- shows missing modules and artifact paths

Test page:

- builds and runs environments
- shows state, actions, tools, scoring, and eval comments

Settings page:

- only runtime configuration, tokens, tools, engines, and worker backends

## Voice

Use plain labels.

Do not use corporate meeting language.

Avoid:

- solutioneering
- unlock
- transform
- seamless
- next-generation
- elevate
- optimize your workflow
- command center
- dashboard when a more precise word exists

Prefer:

- Evidence
- Rows
- Dry-run
- Missing
- Adapter
- Harness
- Score
- Artifact
- State
- Actions

## Visual System

Blend tactical industrial UI with premium minimalism.

Use the tactical telemetry mode:

- dark graphite canvas
- off-white text
- aviation red as the only accent
- square corners
- visible grid lines
- dense monospace metadata
- large structural headings
- no decorative blobs
- no generic SaaS cards
- no gradients as the main visual idea outside the Chipmunk reactor
- no heavy shadows

Use minimalism as restraint:

- fewer words
- fewer controls per surface
- one job per page
- generous negative space where it helps scanning
- flat components
- no noisy explanations inside the app

The interface should feel like a machine room for model behavior work, not a landing page and not a chat app.

## UI Rules

- Every visible panel must map to one of the four loop parts or Settings.
- Every primary action must create, train, test, or inspect a real artifact.
- If a control duplicates the header, remove it.
- If a label would work in a generic SaaS app, rewrite it.
- If a page is about environments, it must support environment creation, not just one predefined harness.
- Use live local state where possible.
- Keep artifact paths visible after actions.
- Keep old routes as redirects when useful, but do not make legacy concepts primary.

## Completion Bar

A UI change is not done until:

- the header reflects the four-part loop
- the home page shows all four parts
- each loop part has a page
- the old one-off product framing is gone
- build passes
- browser verification checks the actual visible page
