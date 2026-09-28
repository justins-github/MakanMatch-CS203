package com.makanmatch.account_service.claim;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.account_service.claim.dto.ClaimResponse;
import com.makanmatch.account_service.claim.dto.CreateClaimRequest;
import com.makanmatch.account_service.common.ConflictException;
import com.makanmatch.account_service.common.ForbiddenException;
import com.makanmatch.account_service.common.NotFoundException;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.Profile;
import com.makanmatch.account_service.profile.ProfileService;

/**
 * Venue ownership claims: anyone can ask, an admin decides, and approval is
 * what grants ownership. An admin can't approve their own claim.
 */
@Service
@Transactional
public class ClaimService {

	private final VenueClaimRepository claims;
	private final OwnershipService ownership;
	private final ProfileService profiles;

	public ClaimService(VenueClaimRepository claims, OwnershipService ownership, ProfileService profiles) {
		this.claims = claims;
		this.ownership = ownership;
		this.profiles = profiles;
	}

	public ClaimResponse create(UUID userId, CreateClaimRequest request) {
		String venueId = request.venueId().trim();
		if (ownership.owns(userId, venueId)) {
			throw new ConflictException("You already manage this venue");
		}
		if (claims.existsByUserIdAndVenueIdAndStatus(userId, venueId, ClaimStatus.PENDING)) {
			throw new ConflictException("You already have a pending claim for this venue");
		}
		VenueClaim claim = claims.save(
				new VenueClaim(userId, venueId, request.venueName().trim(), request.proof().trim()));
		return toResponses(List.of(claim)).get(0);
	}

	@Transactional(readOnly = true)
	public List<ClaimResponse> mine(UUID userId) {
		return toResponses(claims.findByUserIdOrderByCreatedAtDesc(userId));
	}

	public ClaimResponse withdraw(UUID userId, UUID claimId) {
		VenueClaim claim = find(claimId);
		// Someone else's claim looks the same as a missing one.
		if (!claim.getUserId().equals(userId)) throw new NotFoundException("No such claim");
		claim.withdraw();
		return toResponses(List.of(claim)).get(0);
	}

	/** @param status null lists every claim, newest first */
	@Transactional(readOnly = true)
	public List<ClaimResponse> list(ClaimStatus status) {
		List<VenueClaim> found = status == null
				? claims.findAllByOrderByCreatedAtDesc()
				: claims.findByStatusOrderByCreatedAtAsc(status);
		return toResponses(found);
	}

	public ClaimResponse approve(UUID adminId, UUID claimId) {
		VenueClaim claim = find(claimId);
		if (claim.getUserId().equals(adminId)) {
			throw new ForbiddenException("Another admin has to approve your own claim");
		}
		claim.approve(adminId);
		ownership.grant(claim.getUserId(), claim.getVenueId(), claim.getVenueName(), claim.getId());
		return toResponses(List.of(claim)).get(0);
	}

	public ClaimResponse reject(UUID adminId, UUID claimId, String reason) {
		VenueClaim claim = find(claimId);
		claim.reject(adminId, reason.trim());
		return toResponses(List.of(claim)).get(0);
	}

	private VenueClaim find(UUID claimId) {
		return claims.findById(claimId).orElseThrow(() -> new NotFoundException("No such claim"));
	}

	private List<ClaimResponse> toResponses(List<VenueClaim> found) {
		Map<UUID, Profile> people = profiles.findAll(found.stream().map(VenueClaim::getUserId).distinct().toList());
		return found.stream().map(claim -> {
			Profile who = people.get(claim.getUserId());
			ClaimResponse.Claimant claimant = who == null
					? new ClaimResponse.Claimant(claim.getUserId(), null, null)
					: new ClaimResponse.Claimant(who.getId(), who.getDisplayName(), who.getUsername());
			return new ClaimResponse(claim.getId(), claim.getVenueId(), claim.getVenueName(), claim.getProof(),
					claim.getStatus(), claim.getCreatedAt(), claim.getReviewedAt(), claim.getRejectReason(), claimant);
		}).toList();
	}
}
