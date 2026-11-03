package com.makanmatch.account_service.profile.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.owner.dto.OwnedVenueResponse;
import com.makanmatch.account_service.profile.DietaryNeeds;

/**
 * The signed-in account. Other services call GET /api/me with the user's token
 * to learn {@code effectiveRole} and {@code ownedVenues} instead of reading our tables.
 *
 * @param admin         whether the account really is an admin (unaffected by act-as)
 * @param effectiveRole the role this request is served with (act-as applied)
 */
public record MeResponse(
		UUID id,
		String email,
		String displayName,
		String username,
		DietaryNeeds dietary,
		boolean admin,
		EffectiveRole effectiveRole,
		List<OwnedVenueResponse> ownedVenues,
		Instant createdAt) {
}
