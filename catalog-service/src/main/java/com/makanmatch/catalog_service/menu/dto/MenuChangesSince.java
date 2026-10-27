package com.makanmatch.catalog_service.menu.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * What changed on a venue's menu since a moment (a diner's last visit): dishes whose
 * shown price changed, dishes added, dishes taken off, and the typical price (median
 * shown price of what was on the menu) then and now; null when nothing had a price.
 */
public record MenuChangesSince(List<RepricedDish> repriced, List<ChangedDish> added, List<ChangedDish> removed,
		BigDecimal priceThen, BigDecimal priceNow) {

	/** The price the app shows (the owner's, else the latest diner report) then and now; from is null for a first price. */
	public record RepricedDish(String dishId, String name, BigDecimal from, BigDecimal to, Instant at) {
	}

	/** A dish added (with its current price, if any) or removed (price null), and when. */
	public record ChangedDish(String dishId, String name, BigDecimal price, Instant at) {
	}
}
