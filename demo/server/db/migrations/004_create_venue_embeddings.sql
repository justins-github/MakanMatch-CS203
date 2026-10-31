-- Prior vectors for venues (sentence embeddings of name + cuisine + category,
-- built offline by scripts/embed-venues.mjs and uploaded by
-- scripts/upload-venue-vectors.mjs). The engine asks pgvector for cosine
-- similarity between a user's taste_vector and nearby venues.
create table taste.venue_embeddings (
    gers_id   text primary key,
    model     text        not null,
    embedding vector(384) not null
);

-- Reached through the engine only. Row Level Security with no policies keeps
-- Supabase's public Data API away from these tables.
alter table taste.reviews          enable row level security;
alter table taste.rankings         enable row level security;
alter table taste.taste_profiles   enable row level security;
alter table taste.venue_embeddings enable row level security;
