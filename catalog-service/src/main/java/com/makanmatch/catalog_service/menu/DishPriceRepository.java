package com.makanmatch.catalog_service.menu;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DishPriceRepository extends JpaRepository<DishPrice, Long> {

	List<DishPrice> findByDishIdOrderByReportedAtDesc(String dishId);

	/** One query for a whole menu's prices, newest first. */
	List<DishPrice> findByDishIdInOrderByReportedAtDesc(Collection<String> dishIds);

	/** The prices stay (other diners rely on them); who reported them goes. */
	@Modifying
	@Query("update DishPrice p set p.reportedBy = null where p.reportedBy = :userId")
	int forgetReporter(@Param("userId") UUID userId);
}
