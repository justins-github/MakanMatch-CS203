package com.makanmatch.catalog_service.contributions;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.catalog_service.menu.MenuService;
import com.makanmatch.catalog_service.venue.OpeningHoursService;
import com.makanmatch.catalog_service.venue.VenueService;

/**
 * Deleting an account: what it added to the catalog (dishes, prices, status
 * reports, opening hours) stays for everyone else, but no longer says who added it.
 * One transaction, so it's all or nothing.
 */
@Service
@Transactional
public class ContributionsService {

	private final MenuService menus;
	private final VenueService venues;
	private final OpeningHoursService hours;

	public ContributionsService(MenuService menus, VenueService venues, OpeningHoursService hours) {
		this.menus = menus;
		this.venues = venues;
		this.hours = hours;
	}

	public void forget(UUID userId) {
		menus.forgetContributor(userId);
		venues.forgetReporter(userId);
		hours.forgetSetter(userId);
	}
}
