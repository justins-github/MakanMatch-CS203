package com.makanmatch.catalog_service.venue;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OpeningSessionRepository extends JpaRepository<OpeningSession, Long> {

	List<OpeningSession> findByVenueIdOrderByDayOfWeekAscOpensAsc(String venueId);

	List<OpeningSession> findAllByOrderByVenueIdAscDayOfWeekAscOpensAsc();

	@Modifying
	@Query("delete from OpeningSession s where s.venueId = :venueId")
	void deleteByVenueId(@Param("venueId") String venueId);
}
