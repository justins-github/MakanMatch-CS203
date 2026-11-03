package com.makanmatch.catalog_service.venue.dto;

import com.makanmatch.catalog_service.venue.VenueStatus;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** @param newAddress required when status is MOVED */
public record VenueUpdateRequest(
		@NotNull VenueStatus status,
		@Size(max = 200) String newAddress,
		@Size(max = 200) String openingHours,
		@Size(max = 500) String note) {
}
