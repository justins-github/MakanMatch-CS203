create table taste.taste_profile_history (
    user_id      uuid        not null,
    snapshot_date date       not null,
    profile      jsonb       not null,
    updated_at   timestamptz not null default now(),
    primary key (user_id, snapshot_date)
);

create index taste_profile_history_updated_at_idx
    on taste.taste_profile_history (user_id, updated_at);

alter table taste.taste_profile_history enable row level security;
