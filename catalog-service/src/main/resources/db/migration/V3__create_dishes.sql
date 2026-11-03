-- Menus emerge from dishes: owners add official ones, diners add the ones they
-- ate (source says which), and seeds come from the curated demo data.
-- Archiving hides a dish without losing its reviews or price history.
create table catalog.dishes (
    id         text primary key,
    venue_id   text        not null references catalog.venues (id) on delete cascade,
    name       text        not null check (char_length(name) between 1 and 80),
    source     text        not null check (source in ('OWNER', 'DINER', 'SEED')),
    created_by uuid,
    archived   boolean     not null default false,
    created_at timestamptz not null default now()
);

-- A venue can't list the same live dish twice (case-insensitive).
create unique index dishes_one_live_name_idx on catalog.dishes (venue_id, lower(name)) where not archived;
create index dishes_venue_idx on catalog.dishes (venue_id);
