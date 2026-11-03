package com.makanmatch.account_service.owner;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.account_service.common.NotFoundException;
import com.makanmatch.account_service.owner.dto.OwnedVenueResponse;

/**
 * The single source of truth for "who may manage which venue". Other services
 * (catalog, engine) ask through GET /api/me rather than reading this table.
 */
@Service
@Transactional
public class OwnershipService {

	private final VenueOwnerRepository owners;

	public OwnershipService(VenueOwnerRepository owners) {
		this.owners = owners;
	}

	@Transactional(readOnly = true)
	public List<OwnedVenueResponse> ownedBy(UUID userId) {
		return owners.findByUserIdOrderByGrantedAtAsc(userId).stream().map(OwnedVenueResponse::from).toList();
	}

	@Transactional(readOnly = true)
	public Map<UUID, List<OwnedVenueResponse>> ownedByEach(Collection<UUID> userIds) {
		return owners.findByUserIdIn(userIds).stream().collect(Collectors.groupingBy(VenueOwner::getUserId,
				Collectors.mapping(OwnedVenueResponse::from, Collectors.toList())));
	}

	@Transactional(readOnly = true)
	public boolean owns(UUID userId, String venueId) {
		return owners.existsByUserIdAndVenueId(userId, venueId);
	}

	@Transactional(readOnly = true)
	public boolean ownsAny(UUID userId) {
		return owners.existsByUserId(userId);
	}

	/** Idempotent: granting an existing ownership changes nothing. */
	public void grant(UUID userId, String venueId, String venueName, UUID claimId) {
		if (!owners.existsByUserIdAndVenueId(userId, venueId)) {
			owners.save(new VenueOwner(venueId, venueName, userId, claimId));
		}
	}

	public void revoke(UUID userId, String venueId) {
		VenueOwner owner = owners.findByUserIdAndVenueId(userId, venueId)
				.orElseThrow(() -> new NotFoundException("That account doesn't manage this venue"));
		owners.delete(owner);
	}
}
