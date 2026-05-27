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

## Chess Image Input

Current state:

- the chess harness validates FEN
- `python-chess` checks board legality
- Stockfish is used as an engine when available

Needed before image input can be marked working:

- a local image-to-FEN model or parser
- tests proving the board image becomes the right FEN
