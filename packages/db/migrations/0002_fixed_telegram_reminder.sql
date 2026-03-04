alter table schedule_preferences
  add column if not exists fixed_telegram_enabled boolean not null default false,
  add column if not exists fixed_telegram_time_local time not null default '12:10',
  add column if not exists fixed_telegram_message_mode text not null default 'ai_motivation',
  add column if not exists fixed_telegram_days text not null default 'daily';
