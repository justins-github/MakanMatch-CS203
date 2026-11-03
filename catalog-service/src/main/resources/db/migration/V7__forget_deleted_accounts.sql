-- Deleting an account keeps what it added to the catalog (prices, owner reports,
-- dishes, opening hours: other diners rely on them) but forgets who added it, so
-- the "who" columns are set to null. venue_updates.reported_by was the only one
-- that couldn't be null.
alter table catalog.venue_updates alter column reported_by drop not null;
