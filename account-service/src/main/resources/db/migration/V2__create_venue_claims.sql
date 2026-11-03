-- "I own this venue" requests, reviewed by an admin.
-- venue_id is the venue's id in the catalog; there is no foreign key because
-- venues belong to catalog-service (each service owns only its own schema).
create table accounts.venue_claims (
    id            uuid primary key default gen_random_uuid(),
    venue_id      text        not null,
    venue_name    text        not null,
    user_id       uuid        not null references accounts.profiles (id) on delete cascade,
    proof         text        not null check (char_length(proof) between 10 and 2000),
    status        text        not null default 'PENDING'
                  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
    reviewed_by   uuid references accounts.profiles (id) on delete set null,
    reviewed_at   timestamptz,
    reject_reason text,
    created_at    timestamptz not null default now()
);

-- At most one open claim per person per venue.
create unique index venue_claims_one_pending_idx
    on accounts.venue_claims (user_id, venue_id) where status = 'PENDING';
create index venue_claims_status_idx on accounts.venue_claims (status, created_at);
