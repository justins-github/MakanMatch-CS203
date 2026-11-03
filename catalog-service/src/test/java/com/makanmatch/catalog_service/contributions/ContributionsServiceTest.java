package com.makanmatch.catalog_service.contributions;

import static org.mockito.Mockito.verify;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.catalog_service.menu.MenuService;
import com.makanmatch.catalog_service.venue.OpeningHoursService;
import com.makanmatch.catalog_service.venue.VenueService;

@ExtendWith(MockitoExtension.class)
class ContributionsServiceTest {

	private static final UUID USER = UUID.fromString("44444444-4444-4444-4444-444444444444");

	@Mock
	MenuService menus;
	@Mock
	VenueService venues;
	@Mock
	OpeningHoursService hours;

	@Test
	void unattributesDishesPricesReportsAndHours() {
		new ContributionsService(menus, venues, hours).forget(USER);

		verify(menus).forgetContributor(USER);
		verify(venues).forgetReporter(USER);
		verify(hours).forgetSetter(USER);
	}
}
