package com.makanmatch.account_service.kaki;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface KakiGroupRepository extends JpaRepository<KakiGroup, UUID> {

	/** Members are fetched in the same query, since every caller lists them. */
	@EntityGraph(attributePaths = "memberIds")
	List<KakiGroup> findByOwnerId(UUID ownerId);

	Optional<KakiGroup> findByIdAndOwnerId(UUID id, UUID ownerId);

	/** The owner's groups that include this person. */
	@Query("select g from KakiGroup g where g.ownerId = :ownerId and :memberId member of g.memberIds")
	List<KakiGroup> findByOwnerIdAndMember(@Param("ownerId") UUID ownerId, @Param("memberId") UUID memberId);
}
