-- Owner-set weekly opening hours, one row per opening session (a hawker stall
-- open for lunch and dinner has two rows that day). Saving replaces the venue's
-- whole week. A day with no rows is closed; a venue with no rows at all has
-- unknown hours - true for most venues, since the open data carries none.
-- Separate from venue_updates so posting a status never wipes the hours.
-- "if not exists": safe if this was already run by hand in the Supabase SQL
-- editor; Flyway still records V5 without failing.
create table if not exists catalog.opening_hours (
    id          bigint generated always as identity primary key,
    venue_id    text        not null references catalog.venues (id) on delete cascade,
    day_of_week smallint    not null check (day_of_week between 1 and 7), -- ISO: 1 = Monday
    opens       time        not null,
    -- earlier than opens = runs past midnight; equal to opens = open 24 hours
    closes      time        not null,
    set_by      uuid,
    set_at      timestamptz not null default now()
);

create index if not exists opening_hours_venue_idx on catalog.opening_hours (venue_id, day_of_week, opens);

alter table catalog.opening_hours enable row level security;
