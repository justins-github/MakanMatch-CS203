package com.makanmatch.catalog_service.venue.dto;

import java.time.Instant;

import com.makanmatch.catalog_service.venue.Venue;

/**
 * A venue as the open data describes it, plus the owner's latest report.
 *
 * @param status what the owner last reported (with any moved-to address), or null if nothing yet
 */
public record VenueResponse(
		String id,
		String name,
		String address,
		String postcode,
		Double lat,
		Double lon,
		String cuisine,
		String category,
		String source,
		Double confidence,
		Instant sourceUpdatedAt,
		VenueStatusResponse status) {

	public static VenueResponse from(Venue venue, VenueStatusResponse status) {
		return new VenueResponse(venue.getId(), venue.getName(), venue.getAddress(), venue.getPostcode(),
				venue.getLat(), venue.getLon(), venue.getCuisine(), venue.getCategory(), venue.getSource(),
				venue.getConfidence(), venue.getSourceUpdatedAt(), status);
	}
}
