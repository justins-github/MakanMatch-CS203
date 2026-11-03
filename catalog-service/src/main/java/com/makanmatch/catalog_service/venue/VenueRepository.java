package com.makanmatch.catalog_service.venue;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VenueRepository extends JpaRepository<Venue, String> {

	/**
	 * Case-insensitive "contains" search, names starting with the query first,
	 * then shorter names. {@code pattern} must already be lower-case and escaped.
	 */
	@Query("""
			select v from Venue v
			where lower(v.name) like concat('%', :pattern, '%') escape '\\'
			order by case when lower(v.name) like concat(:pattern, '%') escape '\\' then 0 else 1 end,
			         length(v.name), v.name
			""")
	List<Venue> search(@Param("pattern") String pattern, Pageable page);
}
