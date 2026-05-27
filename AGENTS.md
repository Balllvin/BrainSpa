# Brain Spa Agent Instructions

Follow `docs/ui-ux-architecture.md` before changing UI or product flow.

Brain Spa is a local app for changing model behavior through a four-part loop:

1. Evidence: find proof of the behavior the user wants.
2. Datasets: turn evidence into training rows and preference pairs.
3. Tune: dry-run, fine-tune, and produce adapter artifacts.
4. Test: build environments and harnesses that score behavior.

Settings is only for runtime configuration, tokens, tools, engines, and worker backends.

Chipmunk is the JARVIS-like operator inside Brain Spa. It helps route and operate the Evidence, Datasets, Tune, and Test loop for training and tuning user-owned models. Treat Chipmunk as the visible operating intelligence of the app, not as a mascot, one-off bot, or generic chat box.

The app has four resident model workers:

- Source Model owns Evidence.
- Data Model owns Datasets.
- Training Model owns Tune.
- Harness Model owns Test.

Each worker has focused memory for its part of the loop and can read artifacts from the other parts.

Harness means the world, tools, allowed actions, and scoring rules an AI receives. Brain Spa uses harnesses both for its own workers and for testing models created by the app.

UI rules:

- Put the four loop parts in the header.
- Put the four loop parts on the home page.
- Use a reactive Chipmunk arc-reactor core on the home page. It should be real 3D/WebGL, not a flat CSS circle. It should feel like a red/amber JARVIS-style operator interface in Brain Spa colors, with rotating particle pixels, varied block fragments, different sizes, changing density, multiple axes of rotation, centered depth, no drawn outer ring, and active energy filling the reactor.
- Do not make the app about a single adapter, bot, chess harness, or demo.
- Do not use corporate copy or vague product language.
- Keep the interface sparse, mechanical, direct, and artifact-driven.
- Blend tactical industrial UI with restrained minimalism.
- Remove duplicate controls when the header already handles navigation.
- Verify visible browser behavior before calling UI work complete.

Engineering rules:

- Prefer simple React and CSS.
- Keep routes explicit.
- Keep old routes as redirects when they protect existing links.
- Run `npm run build` after frontend changes.
- Run API tests when backend behavior changes.
