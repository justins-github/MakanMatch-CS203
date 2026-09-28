-- What owners report about their venue. Kept apart from catalog.venues so the
-- monthly Overture refresh never overwrites an owner's report, and so "what the
-- open data says" and "what the owner says" stay distinguishable. The newest row
-- per venue is its current owner-reported status; older rows are the history.
create table catalog.venue_updates (
    id            uuid primary key default gen_random_uuid(),
    venue_id      text        not null references catalog.venues (id) on delete cascade,
    status        text        not null
                  check (status in ('OPEN', 'TEMPORARILY_CLOSED', 'CLOSED', 'MOVED')),
    new_address   text,
    opening_hours text,
    note          text,
    reported_by   uuid        not null,
    created_at    timestamptz not null default now(),
    check (status <> 'MOVED' or new_address is not null)
);

create index venue_updates_venue_idx on catalog.venue_updates (venue_id, created_at desc);
