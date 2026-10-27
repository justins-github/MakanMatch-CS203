package com.makanmatch.account_service.claim.dto;

import java.time.Instant;
import java.util.UUID;

import com.makanmatch.account_service.claim.ClaimStatus;

public record ClaimResponse(
		UUID id,
		String venueId,
		String venueName,
		String proof,
		ClaimStatus status,
		Instant createdAt,
		Instant reviewedAt,
		String rejectReason,
		Claimant claimant) {

	/** Who made the claim, as shown in the admin queue. */
	public record Claimant(UUID id, String displayName, String username) {
	}
}
