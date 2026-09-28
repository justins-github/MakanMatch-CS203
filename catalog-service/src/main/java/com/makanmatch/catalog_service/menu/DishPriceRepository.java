package com.makanmatch.catalog_service.menu;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DishPriceRepository extends JpaRepository<DishPrice, Long> {

	List<DishPrice> findByDishIdOrderByReportedAtDesc(String dishId);

	/** One query for a whole menu's prices, newest first. */
	List<DishPrice> findByDishIdInOrderByReportedAtDesc(Collection<String> dishIds);
}
