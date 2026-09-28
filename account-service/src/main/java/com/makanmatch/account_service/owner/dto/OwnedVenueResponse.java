package com.makanmatch.account_service.owner.dto;

import java.time.Instant;

import com.makanmatch.account_service.owner.VenueOwner;

/** A venue the account may manage. */
public record OwnedVenueResponse(String venueId, String venueName, Instant grantedAt) {

	public static OwnedVenueResponse from(VenueOwner owner) {
		return new OwnedVenueResponse(owner.getVenueId(), owner.getVenueName(), owner.getGrantedAt());
	}
}
