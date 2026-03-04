import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import type { Channel } from "@coach/shared";

export type SessionUser = {
  id: string;
  email: string;
  timezone: string;
};

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function withClient<T = any>(fn: (client: Pool) => Promise<T>): Promise<T> {
  const db = getPool();
  return fn(db);
}

export async function requestMagicLink(email: string): Promise<{ code: string }> {
  const code = randomBytes(3).toString("hex").toUpperCase();
  await withClient(async (db) => {
    await db.query(
      `insert into auth_otps (email, code, expires_at) values ($1, $2, now() + interval '15 minutes')`,
      [email, code]
    );
  });
  return { code };
}

export async function verifyMagicCode(email: string, code: string): Promise<{ sessionToken: string; user: SessionUser } | null> {
  return withClient(async (db) => {
    const otpResult = await db.query(
      `select id from auth_otps where email = $1 and code = $2 and used_at is null and expires_at > now() order by created_at desc limit 1`,
      [email, code]
    );

    if (!otpResult.rowCount) {
      return null;
    }

    await db.query(`update auth_otps set used_at = now() where id = $1`, [otpResult.rows[0].id]);

    const userResult = await db.query(
      `insert into users (email, email_verified)
       values ($1, true)
       on conflict (email) do update set email_verified = true, updated_at = now()
       returning id, email, timezone`,
      [email]
    );

    const sessionToken = randomBytes(32).toString("hex");
    await db.query(`insert into auth_sessions (user_id, token_hash, expires_at) values ($1, digest($2, 'sha256'), now() + interval '30 days')`, [
      userResult.rows[0].id,
      sessionToken
    ]);

    return { sessionToken, user: userResult.rows[0] as SessionUser };
  });
}

export async function getUserBySessionToken(token: string): Promise<SessionUser | null> {
  return withClient(async (db) => {
    const result = await db.query(
      `select u.id, u.email, u.timezone
       from auth_sessions s
       join users u on u.id = s.user_id
       where s.token_hash = digest($1, 'sha256') and s.revoked_at is null and s.expires_at > now()
       limit 1`,
      [token]
    );

    return (result.rows[0] as SessionUser | undefined) ?? null;
  });
}

export async function revokeSession(token: string): Promise<void> {
  await withClient((db) => db.query(`update auth_sessions set revoked_at = now() where token_hash = digest($1, 'sha256') and revoked_at is null`, [token]));
}

export async function listTodos(userId: string): Promise<unknown[]> {
  const result = await withClient((db) =>
    db.query(
      `select id, goal_id, title, notes, status, priority, due_at, snoozed_until, tags, completed_at, created_at, updated_at
       from todos where user_id = $1 order by created_at desc`,
      [userId]
    )
  );
  return result.rows;
}

export async function createTodo(userId: string, payload: Record<string, unknown>): Promise<unknown> {
  const result = await withClient((db) =>
    db.query(
      `insert into todos (user_id, goal_id, title, notes, priority, due_at, tags)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, goal_id, title, notes, status, priority, due_at, snoozed_until, tags, completed_at, created_at, updated_at`,
      [
        userId,
        payload.goal_id ?? null,
        payload.title,
        payload.notes ?? null,
        payload.priority ?? 2,
        payload.due_at ?? null,
        payload.tags ?? []
      ]
    )
  );
  return result.rows[0];
}

export async function updateTodo(userId: string, todoId: string, payload: Record<string, unknown>): Promise<unknown | null> {
  const fields: string[] = [];
  const values: unknown[] = [userId, todoId];
  let idx = 3;

  for (const [key, value] of Object.entries(payload)) {
    fields.push(`${key} = $${idx}`);
    values.push(value);
    idx += 1;
  }
  fields.push(`updated_at = now()`);

  if (payload.status === "done") {
    fields.push(`completed_at = now()`);
  }

  const result = await withClient((db) =>
    db.query(
      `update todos set ${fields.join(", ")} where user_id = $1 and id = $2
       returning id, goal_id, title, notes, status, priority, due_at, snoozed_until, tags, completed_at, created_at, updated_at`,
      values
    )
  );

  return result.rows[0] ?? null;
}

export async function deleteTodo(userId: string, todoId: string): Promise<boolean> {
  const result = await withClient((db) => db.query(`delete from todos where user_id = $1 and id = $2`, [userId, todoId]));
  return (result.rowCount ?? 0) > 0;
}

export async function listGoals(userId: string): Promise<unknown[]> {
  const result = await withClient((db) =>
    db.query(`select * from goals where user_id = $1 order by created_at desc`, [userId])
  );
  return result.rows;
}

export async function createGoal(userId: string, payload: Record<string, unknown>): Promise<unknown> {
  const result = await withClient((db) =>
    db.query(
      `insert into goals (user_id, title, description, target_type, target_value, target_unit, starts_at, ends_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [
        userId,
        payload.title,
        payload.description ?? null,
        payload.target_type ?? "binary",
        payload.target_value ?? null,
        payload.target_unit ?? null,
        payload.starts_at ?? null,
        payload.ends_at ?? null
      ]
    )
  );
  return result.rows[0];
}

export async function updateGoal(userId: string, goalId: string, payload: Record<string, unknown>): Promise<unknown | null> {
  const fields: string[] = [];
  const values: unknown[] = [userId, goalId];
  let idx = 3;

  for (const [key, value] of Object.entries(payload)) {
    fields.push(`${key} = $${idx}`);
    values.push(value);
    idx += 1;
  }
  fields.push(`updated_at = now()`);

  const result = await withClient((db) => db.query(`update goals set ${fields.join(", ")} where user_id = $1 and id = $2 returning *`, values));
  return result.rows[0] ?? null;
}

export async function createIntegrationLink(userId: string, type: "telegram" | "discord"): Promise<{ code: string }> {
  const code = randomBytes(4).toString("hex").toUpperCase();
  await withClient((db) =>
    db.query(
      `insert into integrations (user_id, type, config)
       values ($1, $2, jsonb_build_object('link_code', $3::text))
       on conflict (user_id, type)
       do update set config = jsonb_set(integrations.config, '{link_code}', to_jsonb($3::text)), updated_at = now()`,
      [userId, type, code]
    )
  );
  return { code };
}

export async function linkTelegramByCode(code: string, chatId: string): Promise<string | null> {
  const result = await withClient((db) =>
    db.query(
      `update integrations
       set status = 'active', config = config || jsonb_build_object('chat_id', $2::text)
       where type = 'telegram' and config->>'link_code' = $1::text
       returning user_id`,
      [code, chatId]
    )
  );
  return result.rows[0]?.user_id ?? null;
}

export async function linkDiscordByCode(code: string, channelId: string): Promise<string | null> {
  const result = await withClient((db) =>
    db.query(
      `update integrations
       set status = 'active', config = config || jsonb_build_object('channel_id', $2::text)
       where type = 'discord' and config->>'link_code' = $1::text
       returning user_id`,
      [code, channelId]
    )
  );
  return result.rows[0]?.user_id ?? null;
}

export async function disableIntegration(userId: string, type: string): Promise<boolean> {
  const result = await withClient((db) => db.query(`update integrations set status = 'disabled', updated_at = now() where user_id = $1 and type = $2`, [userId, type]));
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAccount(userId: string): Promise<void> {
  await withClient(async (db) => {
    await db.query(`delete from oauth_tokens where user_id = $1`, [userId]);
    await db.query(`delete from integrations where user_id = $1`, [userId]);
    await db.query(`delete from conversation_messages where user_id = $1`, [userId]);
    await db.query(`delete from users where id = $1`, [userId]);
  });
}

export type DueCheckin = {
  id: string;
  user_id: string;
  timezone: string;
  channel: Channel;
  payload: { text?: string; type?: string; message_mode?: string; local_date?: string; time_local?: string };
  config: { chat_id?: string; channel_id?: string };
};

export async function getDueCheckins(nowIso: string): Promise<DueCheckin[]> {
  const result = await withClient((db) =>
    db.query(
      `select c.id, c.user_id, u.timezone, c.channel, c.payload, i.config
       from checkins c
       join users u on u.id = c.user_id
       join integrations i on i.user_id = c.user_id and i.type = c.channel and i.status = 'active'
       where c.status = 'scheduled' and c.scheduled_for <= $1
       order by c.scheduled_for asc
       limit 200`,
      [nowIso]
    )
  );
  return result.rows as DueCheckin[];
}

export async function markCheckinSent(checkinId: string, providerMessageId: string | null): Promise<void> {
  await withClient((db) =>
    db.query(
      `update checkins
       set status = 'sent', provider_message_id = $2, updated_at = now()
       where id = $1`,
      [checkinId, providerMessageId]
    )
  );
}

export async function markCheckinFailed(checkinId: string): Promise<void> {
  await withClient((db) => db.query(`update checkins set status = 'failed', updated_at = now() where id = $1`, [checkinId]));
}

export async function createDeliveryAttempt(args: {
  checkinId: string;
  provider: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  status: "success" | "retryable_error" | "fatal_error";
}): Promise<void> {
  await withClient((db) =>
    db.query(
      `insert into delivery_attempts (checkin_id, attempt_no, provider, request, response, status)
       values (
         $1,
         coalesce((select max(attempt_no) + 1 from delivery_attempts where checkin_id = $1), 1),
         $2,
         $3::jsonb,
         $4::jsonb,
         $5
       )`,
      [args.checkinId, args.provider, JSON.stringify(args.request), JSON.stringify(args.response), args.status]
    )
  );
}

export async function getSchedulerUsers(): Promise<Array<{ id: string; timezone: string }>> {
  const result = await withClient((db) =>
    db.query(
      `select distinct u.id, u.timezone
       from users u
       join integrations i on i.user_id = u.id and i.status = 'active' and i.type in ('telegram', 'discord')`
    )
  );
  return result.rows as Array<{ id: string; timezone: string }>;
}

export async function scheduleCheckin(args: {
  userId: string;
  goalId?: string;
  channel: Channel;
  scheduledFor: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const result = await withClient((db) =>
    db.query(
      `insert into checkins (user_id, goal_id, channel, scheduled_for, payload)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (user_id, channel, scheduled_for) do nothing`,
      [args.userId, args.goalId ?? null, args.channel, args.scheduledFor, JSON.stringify(args.payload)]
    )
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getUserSchedulingContext(userId: string): Promise<{
  preferences: {
    dnd_start_local: string;
    dnd_end_local: string;
    workday_start_local: string;
    workday_end_local: string;
    fixed_telegram_enabled: boolean;
    fixed_telegram_time_local: string;
    fixed_telegram_message_mode: "ai_motivation";
    fixed_telegram_days: "daily";
  };
  goals: Array<{ id: string; title: string }>;
  openTodos: Array<{ id: string; title: string; due_at?: string | null }>;
}> {
  return withClient(async (db) => {
    const pref = await db.query(
      `select dnd_start_local::text, dnd_end_local::text, workday_start_local::text, workday_end_local::text,
              fixed_telegram_enabled, fixed_telegram_time_local::text, fixed_telegram_message_mode, fixed_telegram_days
       from schedule_preferences where user_id = $1`,
      [userId]
    );
    const goals = await db.query(`select id, title from goals where user_id = $1 and status = 'active' order by created_at asc limit 5`, [userId]);
    const todos = await db.query(
      `select id, title, due_at
       from todos where user_id = $1 and status = 'open' order by coalesce(due_at, now() + interval '365 days') asc limit 10`,
      [userId]
    );

    return {
      preferences:
        pref.rows[0] ??
        ({
          dnd_start_local: "22:00:00",
          dnd_end_local: "07:00:00",
          workday_start_local: "09:00:00",
          workday_end_local: "18:00:00",
          fixed_telegram_enabled: false,
          fixed_telegram_time_local: "12:10:00",
          fixed_telegram_message_mode: "ai_motivation",
          fixed_telegram_days: "daily"
        } as const),
      goals: goals.rows,
      openTodos: todos.rows
    };
  });
}

export async function insertConversationMessage(args: {
  userId: string;
  checkinId?: string;
  direction: "inbound" | "outbound";
  channel: Channel;
  content: string;
  providerMessageId?: string;
  raw?: Record<string, unknown>;
}): Promise<void> {
  await withClient((db) =>
    db.query(
      `insert into conversation_messages (user_id, checkin_id, direction, channel, content, provider_message_id, raw)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [args.userId, args.checkinId ?? null, args.direction, args.channel, args.content, args.providerMessageId ?? null, JSON.stringify(args.raw ?? {})]
    )
  );
}

export async function updateSchedulePreferences(userId: string, payload: Record<string, unknown>): Promise<void> {
  await withClient((db) =>
    db.query(
      `insert into schedule_preferences
       (user_id, dnd_start_local, dnd_end_local, workday_start_local, workday_end_local, checkin_frequency, preferred_windows, calendar_strategy,
        fixed_telegram_enabled, fixed_telegram_time_local, fixed_telegram_message_mode, fixed_telegram_days)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
       on conflict (user_id)
       do update set
         dnd_start_local = excluded.dnd_start_local,
         dnd_end_local = excluded.dnd_end_local,
         workday_start_local = excluded.workday_start_local,
         workday_end_local = excluded.workday_end_local,
         checkin_frequency = excluded.checkin_frequency,
         preferred_windows = excluded.preferred_windows,
         calendar_strategy = excluded.calendar_strategy,
         fixed_telegram_enabled = excluded.fixed_telegram_enabled,
         fixed_telegram_time_local = excluded.fixed_telegram_time_local,
         fixed_telegram_message_mode = excluded.fixed_telegram_message_mode,
         fixed_telegram_days = excluded.fixed_telegram_days,
         updated_at = now()`,
      [
        userId,
        payload.dnd_start_local,
        payload.dnd_end_local,
        payload.workday_start_local,
        payload.workday_end_local,
        payload.checkin_frequency,
        JSON.stringify(payload.preferred_windows ?? []),
        payload.calendar_strategy,
        payload.fixed_telegram_enabled ?? false,
        payload.fixed_telegram_time_local ?? "12:10",
        payload.fixed_telegram_message_mode ?? "ai_motivation",
        payload.fixed_telegram_days ?? "daily"
      ]
    )
  );
}

export type ReminderSettings = {
  fixed_telegram_enabled: boolean;
  fixed_telegram_time_local: string;
  fixed_telegram_message_mode: "ai_motivation";
  fixed_telegram_days: "daily";
};

export async function getReminderSettings(userId: string): Promise<ReminderSettings> {
  return withClient(async (db) => {
    const result = await db.query(
      `select fixed_telegram_enabled, fixed_telegram_time_local::text, fixed_telegram_message_mode, fixed_telegram_days
       from schedule_preferences where user_id = $1`,
      [userId]
    );

    if (!result.rowCount) {
      return {
        fixed_telegram_enabled: false,
        fixed_telegram_time_local: "12:10:00",
        fixed_telegram_message_mode: "ai_motivation",
        fixed_telegram_days: "daily"
      };
    }

    return result.rows[0] as ReminderSettings;
  });
}

export async function updateReminderSettings(
  userId: string,
  payload: {
    fixed_telegram_enabled: boolean;
    fixed_telegram_time_local: string;
    fixed_telegram_message_mode: "ai_motivation";
    fixed_telegram_days: "daily";
  }
): Promise<void> {
  await withClient((db) =>
    db.query(
      `insert into schedule_preferences
       (user_id, fixed_telegram_enabled, fixed_telegram_time_local, fixed_telegram_message_mode, fixed_telegram_days)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id)
       do update set
         fixed_telegram_enabled = excluded.fixed_telegram_enabled,
         fixed_telegram_time_local = excluded.fixed_telegram_time_local,
         fixed_telegram_message_mode = excluded.fixed_telegram_message_mode,
         fixed_telegram_days = excluded.fixed_telegram_days,
         updated_at = now()`,
      [
        userId,
        payload.fixed_telegram_enabled,
        payload.fixed_telegram_time_local,
        payload.fixed_telegram_message_mode,
        payload.fixed_telegram_days
      ]
    )
  );
}

export async function getLinkedChannels(userId: string): Promise<Channel[]> {
  const result = await withClient((db) =>
    db.query(`select type from integrations where user_id = $1 and status = 'active' and type in ('telegram', 'discord')`, [userId])
  );
  return (result.rows as Array<{ type: Channel }>).map((r) => r.type);
}

export async function getCalendarTokens(
  userId: string
): Promise<Array<{ provider: "google" | "microsoft"; access_token_enc: string }>> {
  const result = await withClient((db) =>
    db.query(
      `select provider, access_token_enc
       from oauth_tokens
       where user_id = $1 and provider in ('google', 'microsoft')`,
      [userId]
    )
  );
  return result.rows as Array<{ provider: "google" | "microsoft"; access_token_enc: string }>;
}

export async function disconnectCalendarProvider(userId: string, provider: "google" | "microsoft"): Promise<boolean> {
  const integrationType = provider === "google" ? "google_calendar" : "ms_graph";
  return withClient(async (db) => {
    const result = await db.query(`delete from oauth_tokens where user_id = $1 and provider = $2`, [userId, provider]);
    await db.query(`update integrations set status = 'disabled', updated_at = now() where user_id = $1 and type = $2`, [userId, integrationType]);
    return (result.rowCount ?? 0) > 0;
  });
}
