# Coach MVP

Monorepo implementation for the PRD MVP:
- Next.js web app + API routes (`apps/web`)
- Cloudflare Worker scheduler (`apps/scheduler`)
- Postgres schema + repository layer (`packages/db`)

## Quickstart

1. Install dependencies:

```bash
pnpm install
```

2. Create local env file (single source of truth):

```bash
cp .env.example .env
```

3. Create database and run migrations:

```bash
psql "$DATABASE_URL" -f packages/db/migrations/0001_init.sql
psql "$DATABASE_URL" -f packages/db/migrations/0002_fixed_telegram_reminder.sql
```

4. Start web app:

```bash
pnpm --filter @coach/web dev
```

5. Start scheduler locally:

```bash
pnpm --filter @coach/scheduler dev
```

Local scheduler note:
- `wrangler dev --test-scheduled` does not provide a production-grade always-on cron service.
- It exposes a test trigger endpoint (`/__scheduled`) and you can also call `POST /run`.
- For reliable automatic delivery, deploy the worker and let Cloudflare Cron drive scheduled runs.

## AI provider configuration

The app supports three extraction modes:
- `AI_PROVIDER=openai` uses OpenAI Responses API.
- `AI_PROVIDER=ollama` uses a local Ollama model (`/api/chat`).
- `AI_PROVIDER=heuristic` disables model calls and uses built-in fallback extraction only.

Set these in root `.env`:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1

OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=
```

Example local setup:

```bash
AI_PROVIDER=ollama
OLLAMA_MODEL=llama3.1:8b
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

`apps/web/.env.local` is optional and only needed for app-specific overrides.

To verify local model wiring:
1. Set `AI_PROVIDER=ollama` and `OLLAMA_MODEL=...` in root `.env`.
2. Start Ollama (`ollama serve`) and ensure the model is pulled.
3. Open `/test_ai` in the web app.
4. Confirm the badge shows `Source: model` (not `heuristic_fallback`).

Telegram command test:
1. Ensure your Telegram integration is linked.
2. Send `/test_ai` to your bot chat.
3. The bot replies with:
   - `provider=<...>` (configured provider)
   - `source=model` when Ollama/OpenAI call succeeded
   - `source=heuristic_fallback` when it fell back

## Internal scheduler flow

The worker hits:
- `POST /api/scheduler/run`
- `POST /api/checkins/dispatch`

Both require `x-internal-key` header matching `INTERNAL_CRON_KEY`.

Cron cadence:
- Scheduler worker is configured for `* * * * *` (every minute).

## Implemented P0 features

- Passwordless OTP request/verify + session cookie
- Todos + goals CRUD
- Schedule preferences read/write
- Telegram + Discord link-code flow and outbound dispatch
- Scheduler pass with DND/workday windows and idempotent checkin scheduling
- Webhook ingestion and AI extraction fallback path
- Account delete path (PII/integration cleanup)
