package com.makanmatch.catalog_service.changes;

import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.catalog_service.menu.MenuService;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince;
import com.makanmatch.catalog_service.venue.VenueService;

/**
 * "What changed since your last visit" (CSD-50): the menu's side from MenuService and
 * the owner's status reports from VenueService, worked out from our own data.
 */
@Service
@Transactional(readOnly = true)
public class VenueChangesService {

	private final MenuService menus;
	private final VenueService venues;

	public VenueChangesService(MenuService menus, VenueService venues) {
		this.menus = menus;
		this.venues = venues;
	}

	public VenueChangesResponse since(String venueId, Instant since) {
		MenuChangesSince menu = menus.changesSince(venueId, since);
		return new VenueChangesResponse(since, menu.repriced(), menu.added(), menu.removed(),
				venues.updatesSince(venueId, since), menu.priceThen(), menu.priceNow());
	}
}
