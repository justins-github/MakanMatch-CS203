-- When a dish came off the menu (CSD-50: "what changed since your last visit").
-- Null for live dishes, and for dishes archived before this column existed, whose
-- removal date was never recorded.
alter table catalog.dishes add column if not exists archived_at timestamptz;
