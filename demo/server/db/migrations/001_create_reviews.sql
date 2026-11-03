-- Every review a user writes: the evidence the Taste DNA is learned from and
-- the source of the prediction-accuracy meter (predicted vs actual).
-- dish_name/venue_id are snapshots at review time, so rankings still display
-- if the catalog renames or archives the dish. user_id is the Supabase Auth id;
-- dish and venue ids point into catalog-service (no cross-service foreign keys).
create table taste.reviews (
    id         bigint generated always as identity primary key,
    user_id    uuid        not null,
    dish_id    text        not null,
    dish_name  text        not null,
    venue_id   text        not null,
    rating     smallint    not null check (rating between 1 and 5),
    sentiment  text        check (sentiment in ('loved', 'fine', 'disliked')),
    tags       text[]      not null default '{}',
    body       text        not null default '',
    score10    real,
    predicted  smallint    not null,
    actual     smallint    not null,
    created_at timestamptz not null default now()
);

create index reviews_user_idx on taste.reviews (user_id, created_at);
create index reviews_venue_idx on taste.reviews (venue_id);
