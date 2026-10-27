-- Undo (CSD-54): each review keeps the profile as it was just before it, so the
-- latest one can be taken back exactly; undone_at marks one that was.
alter table taste.reviews
    add column if not exists profile_before jsonb,
    add column if not exists undone_at timestamptz;
