-- The learned Taste DNA per user (an AI output, persisted):
--   profile      - the six structured dimensions (cuisine affinities, spice,
--                  richness, price comfort, adventurousness, recently eaten)
--   taste_vector - the learned embedding: the weighted mean of the prior vectors
--                  of venues this user rated above 5/10 (null until then)
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table taste.taste_profiles (
    user_id      uuid primary key,
    profile      jsonb       not null,
    taste_vector vector(384),
    updated_at   timestamptz not null default now()
);
