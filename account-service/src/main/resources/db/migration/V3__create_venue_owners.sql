-- Who may manage which venue. Rows are created when an admin approves a claim
-- (or by the seed script) and deleted when an admin revokes ownership.
create table accounts.venue_owners (
    id         uuid primary key default gen_random_uuid(),
    venue_id   text        not null,
    venue_name text        not null,
    user_id    uuid        not null references accounts.profiles (id) on delete cascade,
    claim_id   uuid references accounts.venue_claims (id) on delete set null,
    granted_at timestamptz not null default now(),
    unique (venue_id, user_id)
);

create index venue_owners_user_idx on accounts.venue_owners (user_id);

-- Everything here is reached through account-service only. Row Level Security
-- with no policies means Supabase's public Data API can never read these tables,
-- even with a leaked publishable key.
alter table accounts.profiles     enable row level security;
alter table accounts.venue_claims enable row level security;
alter table accounts.venue_owners enable row level security;
