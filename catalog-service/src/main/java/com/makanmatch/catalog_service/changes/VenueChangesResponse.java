package com.makanmatch.catalog_service.changes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.makanmatch.catalog_service.menu.dto.MenuChangesSince.ChangedDish;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince.RepricedDish;
import com.makanmatch.catalog_service.venue.dto.VenueUpdateResponse;

/**
 * Everything that changed at a venue since `since`: prices, menu, the owner's reports,
 * and the typical price then and now (which the engine turns into "was / now" match).
 */
public record VenueChangesResponse(
		Instant since,
		List<RepricedDish> prices,
		List<ChangedDish> added,
		List<ChangedDish> removed,
		List<VenueUpdateResponse> updates,
		BigDecimal priceThen,
		BigDecimal priceNow) {
}
