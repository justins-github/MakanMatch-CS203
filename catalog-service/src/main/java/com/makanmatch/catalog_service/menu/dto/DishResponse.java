package com.makanmatch.catalog_service.menu.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.makanmatch.catalog_service.menu.ReportSource;

/**
 * A dish with what we know about its price.
 *
 * @param price          the price to show: the official one when the owner set one
 * @param officialPrice  latest owner-reported price, or null
 * @param communityPrice latest price a diner (or the seed data) reported, or null
 * @param priceConflict  true when diners have since reported a price more than 15%
 *                       away from the official one: the menu is probably out of date
 */
public record DishResponse(
		String id,
		String venueId,
		String name,
		ReportSource source,
		boolean archived,
		BigDecimal price,
		BigDecimal officialPrice,
		BigDecimal communityPrice,
		boolean priceConflict,
		Instant lastPriceAt) {
}
