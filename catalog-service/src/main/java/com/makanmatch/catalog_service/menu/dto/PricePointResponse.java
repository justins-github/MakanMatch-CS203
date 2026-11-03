package com.makanmatch.catalog_service.menu.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.makanmatch.catalog_service.menu.DishPrice;
import com.makanmatch.catalog_service.menu.ReportSource;

public record PricePointResponse(Long id, String dishId, BigDecimal price, ReportSource source, Instant reportedAt) {

	public static PricePointResponse from(DishPrice price) {
		return new PricePointResponse(price.getId(), price.getDishId(), price.getPrice(), price.getSource(),
				price.getReportedAt());
	}
}
