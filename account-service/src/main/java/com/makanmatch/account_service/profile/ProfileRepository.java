package com.makanmatch.account_service.profile;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProfileRepository extends JpaRepository<Profile, UUID> {

	Optional<Profile> findByUsername(String username);

	boolean existsByUsernameAndIdNot(String username, UUID id);

	long countByAdminTrueAndDisabledFalse();

	/**
	 * Creates the profile unless it already exists. Safe when two first requests
	 * from a brand-new account race each other.
	 */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(value = """
			insert into accounts.profiles (id, display_name, is_admin, disabled, created_at, updated_at)
			values (:id, :displayName, false, false, now(), now())
			on conflict (id) do nothing
			""", nativeQuery = true)
	int insertIfAbsent(@Param("id") UUID id, @Param("displayName") String displayName);
}
