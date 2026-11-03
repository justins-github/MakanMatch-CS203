package com.makanmatch.catalog_service.menu;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DishRepository extends JpaRepository<Dish, String> {

	List<Dish> findByVenueIdAndArchivedFalseOrderByNameAsc(String venueId);

	/** Every live dish, for each venue's typical price. */
	List<Dish> findByArchivedFalse();

	/** Live and archived: what changed on a menu needs both. */
	List<Dish> findByVenueIdOrderByNameAsc(String venueId);

	boolean existsByVenueIdAndNameIgnoreCaseAndArchivedFalse(String venueId, String name);

	boolean existsByVenueIdAndNameIgnoreCaseAndArchivedFalseAndIdNot(String venueId, String name, String id);

	@Modifying
	@Query("update Dish d set d.createdBy = null where d.createdBy = :userId")
	int forgetCreator(@Param("userId") UUID userId);
}
