package com.makanmatch.account_service.claim;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VenueClaimRepository extends JpaRepository<VenueClaim, UUID> {

	List<VenueClaim> findByUserIdOrderByCreatedAtDesc(UUID userId);

	/** Oldest first, so the admin queue is worked in arrival order. */
	List<VenueClaim> findByStatusOrderByCreatedAtAsc(ClaimStatus status);

	List<VenueClaim> findAllByOrderByCreatedAtDesc();

	boolean existsByUserIdAndVenueIdAndStatus(UUID userId, String venueId, ClaimStatus status);
}
