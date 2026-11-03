-- Every price anyone reported, never overwritten: this time series is how price
-- changes are detected, and how an owner's official price is compared with what
-- diners actually paid.
create table catalog.dish_prices (
    id          bigint generated always as identity primary key,
    dish_id     text          not null references catalog.dishes (id) on delete cascade,
    price       numeric(8, 2) not null check (price > 0 and price < 10000),
    source      text          not null check (source in ('OWNER', 'DINER', 'SEED')),
    reported_by uuid,
    reported_at timestamptz   not null default now()
);

create index dish_prices_dish_idx on catalog.dish_prices (dish_id, reported_at desc);

-- Reached through catalog-service only. Row Level Security with no policies
-- keeps Supabase's public Data API away from these tables.
alter table catalog.venues        enable row level security;
alter table catalog.venue_updates enable row level security;
alter table catalog.dishes        enable row level security;
alter table catalog.dish_prices   enable row level security;
