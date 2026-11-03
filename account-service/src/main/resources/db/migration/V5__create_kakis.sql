-- Kakis: people who agreed to eat together. One person asks by username, the
-- other accepts. Declining, cancelling and removing all delete the row, so a
-- link is only ever PENDING or ACCEPTED.
-- "if not exists": the shared Supabase DB got these exact tables before this
-- migration was recorded there (same story as V4).
create table if not exists accounts.kaki_links (
    id           uuid primary key default gen_random_uuid(),
    requester_id uuid        not null references accounts.profiles (id) on delete cascade,
    addressee_id uuid        not null references accounts.profiles (id) on delete cascade,
    status       text        not null default 'PENDING'
                 check (status in ('PENDING', 'ACCEPTED')),
    created_at   timestamptz not null default now(),
    accepted_at  timestamptz,
    check (requester_id <> addressee_id)
);

-- One link per pair, whichever way it was asked.
create unique index if not exists kaki_links_pair_idx
    on accounts.kaki_links (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists kaki_links_requester_idx on accounts.kaki_links (requester_id);
create index if not exists kaki_links_addressee_idx on accounts.kaki_links (addressee_id);

-- Saved groups ("Thursday lunch crew"): private shortcuts owned by one person.
-- Members are the owner's accepted kakis; the owner is always included and is
-- not listed as a member.
create table if not exists accounts.kaki_groups (
    id         uuid primary key default gen_random_uuid(),
    owner_id   uuid        not null references accounts.profiles (id) on delete cascade,
    name       text        not null check (char_length(name) between 1 and 40),
    created_at timestamptz not null default now()
);

create index if not exists kaki_groups_owner_idx on accounts.kaki_groups (owner_id);

create table if not exists accounts.kaki_group_members (
    group_id uuid not null references accounts.kaki_groups (id) on delete cascade,
    user_id  uuid not null references accounts.profiles (id) on delete cascade,
    primary key (group_id, user_id)
);

create index if not exists kaki_group_members_user_idx on accounts.kaki_group_members (user_id);

-- Same as V3: reached through account-service only, never the public Data API.
alter table accounts.kaki_links         enable row level security;
alter table accounts.kaki_groups        enable row level security;
alter table accounts.kaki_group_members enable row level security;
