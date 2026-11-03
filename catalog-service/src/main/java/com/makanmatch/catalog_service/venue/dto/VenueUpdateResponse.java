package com.makanmatch.catalog_service.venue.dto;

import java.time.Instant;
import java.util.UUID;

import com.makanmatch.catalog_service.venue.VenueStatus;
import com.makanmatch.catalog_service.venue.VenueUpdate;

public record VenueUpdateResponse(
		UUID id,
		String venueId,
		VenueStatus status,
		String newAddress,
		String openingHours,
		String note,
		Instant reportedAt) {

	public static VenueUpdateResponse from(VenueUpdate update) {
		return new VenueUpdateResponse(update.getId(), update.getVenueId(), update.getStatus(),
				update.getNewAddress(), update.getOpeningHours(), update.getNote(), update.getCreatedAt());
	}
}
