package com.makanmatch.account_service.admin.dto;

import java.util.List;
import java.util.UUID;

import com.makanmatch.account_service.owner.dto.OwnedVenueResponse;

/** One account as the admin user list shows it. Timestamps are Supabase's ISO strings. */
public record AdminUserResponse(
		UUID id,
		String email,
		String displayName,
		String username,
		boolean admin,
		boolean disabled,
		List<OwnedVenueResponse> ownedVenues,
		String createdAt,
		String lastSignInAt) {
}
