package com.makanmatch.catalog_service.venue;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VenueUpdateRepository extends JpaRepository<VenueUpdate, UUID> {

	List<VenueUpdate> findByVenueIdOrderByCreatedAtDesc(String venueId);

	/** The reports stay (they are the venue's history); who made them goes. */
	@Modifying
	@Query("update VenueUpdate u set u.reportedBy = null where u.reportedBy = :userId")
	int forgetReporter(@Param("userId") UUID userId);

	/** The newest report for every venue that has one. */
	@Query(value = """
			select distinct on (venue_id) *
			from catalog.venue_updates
			order by venue_id, created_at desc
			""", nativeQuery = true)
	List<VenueUpdate> findLatestPerVenue();

	/** The newest MOVED report for every venue that has one. */
	@Query(value = """
			select distinct on (venue_id) *
			from catalog.venue_updates
			where status = 'MOVED'
			order by venue_id, created_at desc
			""", nativeQuery = true)
	List<VenueUpdate> findLatestMovePerVenue();

	@Query(value = """
			select distinct on (venue_id) *
			from catalog.venue_updates
			where venue_id in (:venueIds)
			order by venue_id, created_at desc
			""", nativeQuery = true)
	List<VenueUpdate> findLatestFor(@Param("venueIds") Collection<String> venueIds);

	@Query(value = """
			select distinct on (venue_id) *
			from catalog.venue_updates
			where status = 'MOVED' and venue_id in (:venueIds)
			order by venue_id, created_at desc
			""", nativeQuery = true)
	List<VenueUpdate> findLatestMoveFor(@Param("venueIds") Collection<String> venueIds);
}
