-- One profile per Supabase Auth user. Supabase owns auth.users (email, password
-- hash); this table holds what MakanMatch adds on top.
-- "Owner" is not stored here: an account is an owner when it owns a venue
-- (see venue_owners), so the two can never disagree.
create table accounts.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    username     text unique
                 check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
    display_name text        not null check (char_length(display_name) between 1 and 40),
    is_admin     boolean     not null default false,
    disabled     boolean     not null default false,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on column accounts.profiles.username is
    'Optional login alias, stored lower-case; unique, never contains @';
