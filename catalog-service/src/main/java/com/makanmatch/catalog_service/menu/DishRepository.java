package com.makanmatch.catalog_service.menu;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DishRepository extends JpaRepository<Dish, String> {

	List<Dish> findByVenueIdAndArchivedFalseOrderByNameAsc(String venueId);

	/** Every live dish, for each venue's typical price. */
	List<Dish> findByArchivedFalse();

	/** Live and archived: what changed on a menu needs both. */
	List<Dish> findByVenueIdOrderByNameAsc(String venueId);

	boolean existsByVenueIdAndNameIgnoreCaseAndArchivedFalse(String venueId, String name);

	boolean existsByVenueIdAndNameIgnoreCaseAndArchivedFalseAndIdNot(String venueId, String name, String id);
}
