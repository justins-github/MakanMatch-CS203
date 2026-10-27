package com.makanmatch.account_service.kaki;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface KakiLinkRepository extends JpaRepository<KakiLink, UUID> {

	/** Every link the person is part of, whichever side they are on. */
	@Query("select l from KakiLink l where l.requesterId = :userId or l.addresseeId = :userId")
	List<KakiLink> findInvolving(@Param("userId") UUID userId);

	/** The link between two people, whichever of them asked. */
	@Query("""
			select l from KakiLink l
			where (l.requesterId = :a and l.addresseeId = :b) or (l.requesterId = :b and l.addresseeId = :a)
			""")
	Optional<KakiLink> findBetween(@Param("a") UUID a, @Param("b") UUID b);
}
