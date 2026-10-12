-- Арена: рейтинг в отдельной колонке — для подбора соперников и лидерборда
alter table fighters add column if not exists elo int not null default 1000;
create index if not exists fighters_elo_idx on fighters (elo desc);
alter table users add column if not exists last_pvp_notified_at timestamptz;

create table if not exists pvp_fights (
  id           bigserial primary key,
  attacker_id  bigint not null references fighters(id),
  defender_id  bigint references fighters(id), -- null — спарринг-бот
  attacker_won boolean not null,
  elo_delta    int not null,
  result       jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists pvp_fights_defender_idx on pvp_fights (defender_id, created_at desc);
create index if not exists pvp_fights_pair_idx on pvp_fights (attacker_id, defender_id, created_at desc);
