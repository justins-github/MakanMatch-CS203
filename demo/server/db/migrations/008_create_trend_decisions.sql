-- Choices on "Claude's take" suggestions (CSD-56): a trend (key + direction) the
-- user accepted or dismissed is never suggested again.
create table if not exists taste.trend_decisions (
    user_id    uuid        not null,
    trend_key  text        not null,
    direction  text        not null check (direction in ('up', 'down')),
    decision   text        not null check (decision in ('accepted', 'dismissed')),
    decided_at timestamptz not null default now(),
    primary key (user_id, trend_key, direction)
);

alter table taste.trend_decisions enable row level security;
