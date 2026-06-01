# Brain Spa Custom Harnesses

Brain Spa treats Chipmunk as the single supervising operator. Chipmunk can run through Hermes, in-app chat, or Telegram, but the four loop stages are not Hermes agents. They are custom harnesses with their own state, tools, allowed actions, scoring rules, and failure comments.

## Harness Shape

Each stage harness defines:

- `world_state`: the local facts the worker may inspect.
- `allowed_actions`: the actions the worker may take.
- `tools`: the external or local tools made available.
- `scoring_rules`: how useful output is judged.
- `failure_comments`: the comments that turn failures into the next dataset or tuning requirement.
- `template_artifacts`: files the stage is expected to write or inspect.

Keep the harness simple, make tool descriptions and artifacts explicit, log decisions, and let the operator sequence the work instead of hardcoding a brittle pipeline.

## Stage Defaults

| Stage | Owner | Default backend | Job |
| --- | --- | --- | --- |
| Evidence | Source Model | Grok | Gather cited proof from transcripts, web, and X search before rows exist. |
| Datasets | Data Model | OpenCode | Convert evidence into SFT rows and preference pairs with leakage checks. |
| Tune | Training Model | Codex | Dry-run, train, and register adapter artifacts for the selected model. |
| Test | Harness Model | Codex | Build environments and score behavior in chat, coding, or other task worlds. |

## Telegram Wiring

Telegram tokens live only in the runtime secret store:

`~/.brain-spa/secrets/telegram-bots.json`

The app links:

- `chipmunk` bot to Chipmunk's operator route.
- `starter` bot to `starter_model`, the starter validation model.

The API never returns bot tokens. It only reports bot name, model key, whether a chat ID is configured, enabled state, and live verification state.

The local API also runs a Telegram long-polling worker. This is the part that wakes a wired model from a real Telegram DM:

- `getUpdates` reads messages for each enabled, live-verified bot.
- Non-Chipmunk model bots route normal messages to the linked local runtime.
- Chipmunk routes through the operator path when the bot is named `chipmunk` or matches Settings → Chipmunk → Default Telegram bot.
- Chipmunk Telegram commands can execute the same backend actions as the app: dataset preview/generation, training dry-runs, worker previews, and harness eval checks.
- The worker sends the answer back with `sendMessage`.
- The outbound Telegram message ID is stored locally so future replies can be matched to the exact prompt and answer.

Reply feedback is stored in Evidence, not directly in Datasets. A reply to a model bot's answer becomes a source row with the original prompt, the model answer, and user feedback. Dataset generation can later transform that evidence into SFT rows or preference pairs.

## Starter Validation

The Starter workflow uses a small local base model by default. The app can:

- generate grounded SFT rows and preference pairs,
- write trainer recipes,
- build a local LoRA adapter when trainer modules and model weights are available,
- run a fixed 10-question acceptance harness against the adapter,
- write the acceptance artifact under `~/.brain-spa/artifacts/evals/starter_acceptance.json`.

The served Starter runtime loads the local adapter, then applies the Test harness as a stabilizer before returning an answer. Raw adapter output is not served directly; the runtime returns a clean prompt-intent answer that must pass actionability, generic-slop, directness, role-leak, repetition, and fluency checks.

The target behavior is direct, practical, source-grounded answers — not copied source text, generic self-help, role-label leakage, repeated training fragments, or awkward template phrasing.
