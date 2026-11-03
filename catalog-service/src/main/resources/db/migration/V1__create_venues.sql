-- The venue registry: Overture Maps places merged with our curated seeds,
-- loaded and refreshed monthly by scripts/load-venues.mjs. Ids match the ones
-- the recommendation engine uses ("ov-<Overture GERS id>" or a curated slug).
create table catalog.venues (
    id                text primary key,
    name              text        not null,
    address           text,
    postcode          text,
    lat               double precision,
    lon               double precision,
    cuisine           text,
    category          text,
    source            text        not null
                      check (source in ('overture', 'community', 'community+overture')),
    confidence        double precision,
    source_updated_at timestamptz,
    loaded_at         timestamptz not null default now()
);

-- Name search is a case-insensitive "contains"; 22k rows scan in milliseconds,
-- and this index serves the common prefix case.
create index venues_lower_name_idx on catalog.venues (lower(name) text_pattern_ops);
