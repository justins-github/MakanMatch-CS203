package com.makanmatch.catalog_service.changes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.catalog_service.menu.MenuService;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince.ChangedDish;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince.RepricedDish;
import com.makanmatch.catalog_service.venue.VenueService;
import com.makanmatch.catalog_service.venue.VenueStatus;
import com.makanmatch.catalog_service.venue.dto.VenueUpdateResponse;

@ExtendWith(MockitoExtension.class)
class VenueChangesServiceTest {

	private static final Instant VISIT = Instant.parse("2026-10-10T00:00:00Z");

	@Mock
	MenuService menus;
	@Mock
	VenueService venues;

	VenueChangesService service;

	@BeforeEach
	void setUp() {
		service = new VenueChangesService(menus, venues);
	}

	@Test
	void theMenuAndTheOwnersReportsComeTogether() {
		RepricedDish wrap = new RepricedDish("d1", "Chicken doner wrap", new BigDecimal("8.50"), new BigDecimal("10.50"), VISIT);
		ChangedDish shish = new ChangedDish("d2", "Lamb shish", new BigDecimal("13.00"), VISIT);
		ChangedDish iskender = new ChangedDish("d3", "Iskender kebab", null, VISIT);
		VenueUpdateResponse moved = new VenueUpdateResponse(UUID.randomUUID(), "turks-kebab", VenueStatus.MOVED,
				"35 Selegie Rd #01-C2", null, null, VISIT.plusSeconds(60));
		given(menus.changesSince("turks-kebab", VISIT))
				.willReturn(new MenuChangesSince(List.of(wrap), List.of(shish), List.of(iskender), new BigDecimal("5.75"),
						new BigDecimal("10.50")));
		given(venues.updatesSince("turks-kebab", VISIT)).willReturn(List.of(moved));

		VenueChangesResponse changes = service.since("turks-kebab", VISIT);

		assertThat(changes.since()).isEqualTo(VISIT);
		assertThat(changes.prices()).containsExactly(wrap);
		assertThat(changes.added()).containsExactly(shish);
		assertThat(changes.removed()).containsExactly(iskender);
		assertThat(changes.updates()).containsExactly(moved);
		assertThat(changes.priceThen()).isEqualByComparingTo("5.75");
		assertThat(changes.priceNow()).isEqualByComparingTo("10.50");
	}
}
