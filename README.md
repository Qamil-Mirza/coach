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

2. Create database and run migration:

```bash
psql "$DATABASE_URL" -f packages/db/migrations/0001_init.sql
```

3. Start web app:

```bash
pnpm --filter @coach/web dev
```

4. Start scheduler locally:

```bash
pnpm --filter @coach/scheduler dev
```

## Internal scheduler flow

The worker hits:
- `POST /api/scheduler/run`
- `POST /api/checkins/dispatch`

Both require `x-internal-key` header matching `INTERNAL_CRON_KEY`.

## Implemented P0 features

- Passwordless OTP request/verify + session cookie
- Todos + goals CRUD
- Schedule preferences read/write
- Telegram + Discord link-code flow and outbound dispatch
- Scheduler pass with DND/workday windows and idempotent checkin scheduling
- Webhook ingestion and AI extraction fallback path
- Account delete path (PII/integration cleanup)
