package com.makanmatch.catalog_service.venue.dto;

import java.time.Instant;

import com.makanmatch.catalog_service.venue.VenueStatus;
import com.makanmatch.catalog_service.venue.VenueUpdate;

/**
 * The venue as its owner describes it now: the latest report's status, hours and
 * note, plus where it is. A move stays true after later reports ("moved", then
 * "open as usual" still means open at the new address), so {@code currentAddress}
 * comes from the latest MOVED report, whenever that was.
 *
 * @param currentAddress the owner-reported address, or null if the owner never reported a move
 */
public record VenueStatusResponse(
		String venueId,
		VenueStatus status,
		String currentAddress,
		String openingHours,
		String note,
		Instant reportedAt) {

	public static VenueStatusResponse of(VenueUpdate latest, VenueUpdate latestMove) {
		return new VenueStatusResponse(latest.getVenueId(), latest.getStatus(),
				latestMove == null ? null : latestMove.getNewAddress(),
				latest.getOpeningHours(), latest.getNote(), latest.getCreatedAt());
	}
}
