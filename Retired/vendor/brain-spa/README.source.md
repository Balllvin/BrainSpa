# Brain Spa

Brain Spa is a portable local runner for Telegram-connected MLX personas. It runs Retardmaxxer and The Believer from this repo, keeps tokens and chat state outside git, logs Telegram reply feedback, and turns that feedback into training datasets for the next local model iteration.

The runner uses trained adapter weights when they exist locally. If adapter weights are not present, it still starts from the prompted base model so a fresh clone can be installed, tested, and exercised before training custom adapters.

## What Ships

- `scripts/brain_spa_persona_direct.py`: direct Telegram polling runner and probe command.
- `scripts/persona_launch_agents.py`: macOS LaunchAgent installer, status checker, and restarter.
- `scripts/setup-local-runtime.py`: creates the local runtime folders and sample private config.
- `scripts/build_believer_feedback_training_data.py`: builds Believer MLX training data from Telegram feedback plus broad Christian QA.
- `scripts/build_retardmaxxing_feedback_training_data.py`: builds Retardmaxxer MLX training data from Telegram feedback plus wide style QA.
- `scripts/train_believer_mlx_non_strict.py`: local MLX adapter training entrypoint for Believer data.
- `config/telegram-bots.example.json`: safe template for local Telegram bot credentials.
- `requirements/persona-runner.txt`: Python dependencies for the runtime.
- `tests/`: focused tests for prompt repair, Telegram feedback handling, launchd generation, and dataset builders.

Generated adapters, datasets, runtime state, copied app experiments, logs, and secrets are ignored by git.

## Requirements

- Python 3.11 or newer.
- macOS for LaunchAgent auto-start. Manual foreground bot runs work anywhere MLX and Telegram HTTPS work.
- Apple Silicon is recommended for `mlx-lm`.
- Telegram bot tokens from BotFather and the Telegram chat id that is allowed to talk to each bot.

## Quick Start

```bash
git clone git@github.com:Balllvin/brain-spa.git
cd brain-spa
python3 scripts/setup-local-runtime.py
```

## Open The Website

When Alvin says `open`, `open website`, or `open Brain Spa` from this workspace, treat that as a request to open the local Brain Spa website, not the folder in Finder. Start the app if needed, then open:

```text
http://127.0.0.1:3000
```

For the full app workspace, run the `data-spa` backend on `http://127.0.0.1:8000` and the frontend with `BACKEND_URL=http://127.0.0.1:8000 npm run dev`.

Edit the private config created at `~/.brain-spa-runtime/brain-spa-telegram-bots.json` and replace the placeholder tokens and chat ids. The runtime root can be moved with `BRAIN_SPA_RUNTIME_ROOT=/path/to/runtime`.

Install dependencies into the runtime venv:

```bash
python3 -m venv ~/.brain-spa-runtime/mlx-venv
~/.brain-spa-runtime/mlx-venv/bin/pip install -r requirements/persona-runner.txt
```

Probe the personas locally:

```bash
~/.brain-spa-runtime/mlx-venv/bin/python scripts/brain_spa_persona_direct.py probe
```

On macOS, install both Telegram bots as LaunchAgents:

```bash
python3 scripts/persona_launch_agents.py install
python3 scripts/persona_launch_agents.py status
```

For foreground debugging, run either bot directly:

```bash
~/.brain-spa-runtime/mlx-venv/bin/python scripts/brain_spa_persona_direct.py run-bot --project-id 4
~/.brain-spa-runtime/mlx-venv/bin/python scripts/brain_spa_persona_direct.py run-bot --project-id 5
```

Project `4` is Retardmaxxer. Project `5` is The Believer.

## Adapter Weights

The runner automatically uses adapter weights when these local files exist:

- `demos/retardmaxxing-elisha-long-active/outputs/production-final/adapters/adapters.safetensors`
- `demos/the-believer-active/outputs/production-final/adapters/adapters.safetensors`

Those files are intentionally ignored because model artifacts are large and machine-specific. Without them, the same commands still run with the prompted base model `mlx-community/gemma-4-e2b-it-4bit`.

## Telegram Feedback

Replying in Telegram to a bot answer is treated as feedback. The bot acknowledges the reply, skips generation for that update, and appends a private JSONL record under:

```text
~/.brain-spa-runtime/telegram-bots/feedback/
```

Build fresh training data from accumulated feedback:

```bash
python3 scripts/build_believer_feedback_training_data.py
python3 scripts/build_retardmaxxing_feedback_training_data.py
```

The output lands under ignored `demos/` paths so local training data does not get committed by accident.

## Validation

Run the repo checks from the clone root:

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest -q -p no:cacheprovider tests
python3 -m py_compile \
  scripts/brain_spa_persona_direct.py \
  scripts/persona_launch_agents.py \
  scripts/setup-local-runtime.py \
  scripts/build_believer_feedback_training_data.py \
  scripts/build_retardmaxxing_feedback_training_data.py \
  scripts/train_believer_mlx_non_strict.py
git diff --check
```

## Security

Do not commit `~/.brain-spa-runtime/brain-spa-telegram-bots.json`, `.env*`, logs, Telegram state, feedback JSONL, adapters, or generated datasets. The example config is safe to commit because it contains only placeholders.
