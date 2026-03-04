create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  timezone text not null default 'America/Los_Angeles',
  display_name text,
  phone_e164 text,
  coach_persona text not null default 'supportive',
  preferences jsonb not null default '{}'::jsonb
);

create table auth_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index auth_otps_lookup_idx on auth_otps(email, code, expires_at);

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash bytea not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index auth_sessions_hash_idx on auth_sessions(token_hash);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  target_type text not null default 'binary',
  target_value numeric,
  target_unit text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  goal_id uuid references goals(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'open',
  priority smallint not null default 2,
  due_at timestamptz,
  snoozed_until timestamptz,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index todos_user_status_idx on todos(user_id, status);
create index todos_user_due_idx on todos(user_id, due_at);

create table schedule_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  dnd_start_local time not null default '22:00',
  dnd_end_local time not null default '07:00',
  workday_start_local time not null default '09:00',
  workday_end_local time not null default '18:00',
  checkin_frequency text not null default 'daily',
  preferred_windows jsonb not null default '[]'::jsonb,
  calendar_strategy text not null default 'freebusy_first',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  status text not null default 'active',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, type)
);

create table oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  access_token_enc text not null,
  refresh_token_enc text,
  scope text,
  token_type text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  goal_id uuid references goals(id) on delete set null,
  channel text not null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled',
  payload jsonb not null default '{}'::jsonb,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(user_id, channel, scheduled_for)
);

create index checkins_due_idx on checkins(status, scheduled_for);

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  checkin_id uuid references checkins(id) on delete set null,
  direction text not null,
  channel text not null,
  content text not null,
  raw jsonb not null default '{}'::jsonb,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create table delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references checkins(id) on delete cascade,
  attempt_no int not null,
  provider text not null,
  request jsonb not null,
  response jsonb not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique(checkin_id, attempt_no)
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  event_type text not null,
  event jsonb not null,
  created_at timestamptz not null default now()
);
