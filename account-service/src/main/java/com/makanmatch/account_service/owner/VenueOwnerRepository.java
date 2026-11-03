package com.makanmatch.account_service.owner;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VenueOwnerRepository extends JpaRepository<VenueOwner, UUID> {

	List<VenueOwner> findByUserIdOrderByGrantedAtAsc(UUID userId);

	List<VenueOwner> findByUserIdIn(Collection<UUID> userIds);

	Optional<VenueOwner> findByUserIdAndVenueId(UUID userId, String venueId);

	boolean existsByUserIdAndVenueId(UUID userId, String venueId);

	boolean existsByUserId(UUID userId);
}
