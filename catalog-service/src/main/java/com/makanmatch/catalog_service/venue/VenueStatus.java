package com.makanmatch.catalog_service.venue;

/** What an owner can report about their venue. */
public enum VenueStatus {
	OPEN,
	TEMPORARILY_CLOSED,
	CLOSED,
	/** Needs a new address. */
	MOVED
}
