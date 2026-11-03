package com.makanmatch.catalog_service.venue;

import java.util.List;
import java.util.UUID;

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

	@Modifying
	@Query("update OpeningSession s set s.setBy = null where s.setBy = :userId")
	int forgetSetter(@Param("userId") UUID userId);
}
