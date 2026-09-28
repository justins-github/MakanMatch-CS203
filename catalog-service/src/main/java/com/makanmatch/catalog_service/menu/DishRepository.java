package com.makanmatch.catalog_service.menu;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DishRepository extends JpaRepository<Dish, String> {

	List<Dish> findByVenueIdAndArchivedFalseOrderByNameAsc(String venueId);

	boolean existsByVenueIdAndNameIgnoreCaseAndArchivedFalse(String venueId, String name);

	boolean existsByVenueIdAndNameIgnoreCaseAndArchivedFalseAndIdNot(String venueId, String name, String id);
}
