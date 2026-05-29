# Brain Spa External Setup

Brain Spa is functional locally. These items need a user credential or a local app install.

## Telegram Live Bot

Needed:

- BotFather token
- allowed Telegram chat ID

Where:

- open `http://127.0.0.1:5173/settings`
- fill bot name, token, chat ID, and model
- press `Save bot`
- press `Test Telegram`

What the app does:

- stores the token only in `~/.brain-spa/secrets/telegram-bots.json`
- restricts the secret file permissions
- calls Telegram `getMe`
- keeps Hermes blocked unless the token is live
- rejects non-matching chat IDs

## Cursor Worker

Needed:

- Cursor CLI or command integration on `PATH`

What the app does:

- detects Codex, OpenCode, and Grok when available
- shows Cursor as blocked when missing
- lets `Verify` prove the current state from the app

## Coding Harness Expansion

Current state:

- the coding CLI harness scores workspace boundary awareness
- the harness checks for explicit build/test evidence
- destructive shell commands are flagged by the scorer

Needed before deeper coding environments can be marked working:

- a disposable fixture repository
- a command allowlist per coding task
- tests proving the harness rejects unsafe actions
