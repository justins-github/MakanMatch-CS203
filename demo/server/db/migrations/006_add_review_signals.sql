-- What was read from each review's text (CSD-53): the taste signals, and who read
-- them ('ai' = Claude, 'keywords' = the fallback list). Null for reviews saved before.
alter table taste.reviews
    add column if not exists signals jsonb,
    add column if not exists read_by text check (read_by in ('ai', 'keywords'));
