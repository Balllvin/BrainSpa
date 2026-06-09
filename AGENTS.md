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
- Home loop panels should show the latest useful artifact in each part, not generic counts. The red title is the loop part. The body should be short, clickable, and point to the relevant page.
- Use a reactive Chipmunk arc-reactor field on the home page. It should fill the loop surface, not sit inside a square widget. It should be real 3D/WebGL, not a flat CSS circle. It should feel like a red/amber JARVIS-style operator interface in Brain Spa colors, with rotating particle pixels, varied block fragments, different sizes, changing density, multiple axes of rotation, centered depth, no drawn outer ring, and active energy filling the reactor. Do not put visible text or status labels inside the reactor.
- Clicking the reactor field opens the Chipmunk operator sidebar. Keep that sidebar hidden when the user is not talking to Chipmunk and no request is running.
- Do not make the app about a single adapter, bot, chess harness, or demo. The shipped shell may include Snake as the reference harness, but the product is still the Evidence -> Datasets -> Tune -> Test loop.
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

## Learned User Preferences

- Prefer `npm run start` to run the full app (API + UI); open http://127.0.0.1:5173, not 5174/5175.
- After backend API changes, restart the API (or `npm run start`) before telling the user to reload—do not leave restart banners for the user to fix.
- Test harness scenarios must stay distinct per model; never show old chat scenarios on Snake Policy or vice versa.
- The public shell currently ships only Snake Policy as the concrete model/harness example. Do not reintroduce old persona routes, persona defaults, or old dataset keys unless explicitly requested.
- Snake Test pages: one obvious primary control per page (e.g. Run/Stop), no duplicate play buttons or cryptic glyphs (Roman numerals, mystery ticks).
- Snake parallel training UI: show all boards immediately; no "Board 1/2/3" slot labels; no decorative boxes around compact lab boards.
- Snake stats must be meaningful labeled metrics—not placeholder zeros or vague single-line averages.
- Place primary controls and their stats together (toolbar + adjacent stats), not scattered across the page.
- Every Test/environment page should be extremely simple and focused on testing, not lab chrome or hidden modes.
- Use `/test/snake/autonomous-train` as the reference quality bar for future Test pages: immediate visible world state, parallel environment instances when useful, one primary Run/Stop control, adjacent live metrics, no explanatory in-app text, and no generated screenshots or checkpoints committed.

## Learned Workspace Facts

- Snake Policy maps to `snake_policy` (RL policy harness) and uses `/test/snake`, `/datasets/snake/rollout`, and `/tune/snake`.
- Dev stack: API on `http://127.0.0.1:8000`, Vite on `http://127.0.0.1:5173` with `strictPort: true`; frontend uses the `/api` proxy in dev.
- `scripts/dev-all.mjs` powers `npm run start`; Playwright smoke coverage lives in `scripts/smoke-snake.mjs`.
- Snake Test scenarios resolve via API slug map (`snake` -> `snake_policy`); unknown models return 404, not a default harness.
- Workspace on Desktop/iCloud can cause Cursor agent hangs; keep `.cursorignore` excluding `node_modules` and other heavy trees.
