create table if not exists users (
  id               bigint primary key,            -- Telegram user id
  first_name       text,
  username         text,
  language_code    text,
  tz_offset_min    int not null default 180,      -- смещение от UTC, приходит с клиента
  source           text,                          -- start_param: v12, ref_123, ...
  write_access     boolean not null default false,-- можно ли писать в личку
  bot_blocked      boolean not null default false,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  last_notified_at timestamptz,
  next_reminder_at timestamptz
);
create index if not exists users_next_reminder_idx on users (next_reminder_at)
  where write_access and not bot_blocked;

create table if not exists fighters (
  id          bigserial primary key,
  user_id     bigint not null unique references users(id),
  name        text not null,
  look        int not null default 0,
  state       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists fights (
  id          bigserial primary key,
  fighter_id  bigint not null references fighters(id),
  won         boolean not null,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists payments (
  charge_id   text primary key,                   -- telegram_payment_charge_id, идемпотентность
  user_id     bigint not null references users(id),
  product     text not null,
  stars       int not null,
  status      text not null default 'paid',       -- paid | refunded
  created_at  timestamptz not null default now()
);

create table if not exists events (
  id          bigserial primary key,
  user_id     bigint,
  name        text not null,
  props       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists events_name_time_idx on events (name, created_at);
create index if not exists events_user_idx on events (user_id, created_at);

create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now());
