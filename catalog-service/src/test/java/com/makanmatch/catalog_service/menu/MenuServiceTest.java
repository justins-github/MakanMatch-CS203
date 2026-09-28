package com.makanmatch.catalog_service.menu;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.catalog_service.common.ConflictException;
import com.makanmatch.catalog_service.menu.dto.DishRequest;
import com.makanmatch.catalog_service.menu.dto.DishResponse;
import com.makanmatch.catalog_service.menu.dto.PriceReportRequest;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.security.VenueAccessPolicy;
import com.makanmatch.catalog_service.security.VenueAccessPolicy.Access;
import com.makanmatch.catalog_service.venue.VenueService;

@ExtendWith(MockitoExtension.class)
class MenuServiceTest {

	private static final Caller CALLER = new Caller(UUID.randomUUID(), "token", null);
	private static final Instant T0 = Instant.parse("2026-09-01T00:00:00Z");

	@Mock
	DishRepository dishes;
	@Mock
	DishPriceRepository prices;
	@Mock
	VenueService venues;
	@Mock
	VenueAccessPolicy access;

	MenuService service;

	@BeforeEach
	void setUp() {
		service = new MenuService(dishes, prices, venues, access);
		lenient().when(dishes.save(any())).thenAnswer(call -> call.getArgument(0));
		lenient().when(prices.save(any())).thenAnswer(call -> call.getArgument(0));
		lenient().when(prices.findByDishIdInOrderByReportedAtDesc(any())).thenReturn(List.of());
	}

	@Test
	void anOwnersDishIsOfficial() {
		given(access.accessFor(CALLER, "turks-kebab")).willReturn(Access.MANAGER);
		DishResponse dish = service.create("turks-kebab", new DishRequest("Lamb shish", null), CALLER);
		assertThat(dish.source()).isEqualTo(ReportSource.OWNER);
	}

	@Test
	void aDinersDishIsCommunityData() {
		given(access.accessFor(CALLER, "turks-kebab")).willReturn(Access.DINER);
		DishResponse dish = service.create("turks-kebab", new DishRequest("  Lamb   shish ", null), CALLER);
		assertThat(dish.source()).isEqualTo(ReportSource.DINER);
		assertThat(dish.name()).isEqualTo("Lamb shish");
	}

	@Test
	void aMenuCannotListTheSameDishTwice() {
		given(access.accessFor(CALLER, "turks-kebab")).willReturn(Access.DINER);
		given(dishes.existsByVenueIdAndNameIgnoreCaseAndArchivedFalse("turks-kebab", "Lamb shish")).willReturn(true);
		assertThatThrownBy(() -> service.create("turks-kebab", new DishRequest("Lamb shish", null), CALLER))
				.isInstanceOf(ConflictException.class);
	}

	@Test
	void anOwnerConfirmingAPriceMakesTheDishOfficial() {
		Dish seeded = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.SEED, null);
		given(dishes.findById(seeded.getId())).willReturn(Optional.of(seeded));
		given(access.accessFor(CALLER, "turks-kebab")).willReturn(Access.MANAGER);

		service.reportPrice(seeded.getId(), new PriceReportRequest(new BigDecimal("10.50")), CALLER);

		assertThat(seeded.getSource()).isEqualTo(ReportSource.OWNER);
	}

	@Test
	void aDinerReportingAPriceLeavesTheDishAsItWas() {
		Dish seeded = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.SEED, null);
		given(dishes.findById(seeded.getId())).willReturn(Optional.of(seeded));
		given(access.accessFor(CALLER, "turks-kebab")).willReturn(Access.DINER);

		service.reportPrice(seeded.getId(), new PriceReportRequest(new BigDecimal("10.50")), CALLER);

		assertThat(seeded.getSource()).isEqualTo(ReportSource.SEED);
	}

	@Test
	void newerCommunityPricesFarFromTheOfficialOneFlagAConflict() {
		Dish dish = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.OWNER, null);
		DishResponse summary = MenuService.summarize(dish, List.of(
				price(dish, "10.50", ReportSource.DINER, T0.plusSeconds(60)),
				price(dish, "8.50", ReportSource.OWNER, T0)));

		assertThat(summary.price()).isEqualByComparingTo("8.50");
		assertThat(summary.communityPrice()).isEqualByComparingTo("10.50");
		assertThat(summary.priceConflict()).isTrue();
	}

	@Test
	void anOwnerUpdateAfterTheCommunityReportResolvesTheConflict() {
		Dish dish = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.OWNER, null);
		DishResponse summary = MenuService.summarize(dish, List.of(
				price(dish, "10.50", ReportSource.OWNER, T0.plusSeconds(120)),
				price(dish, "10.50", ReportSource.DINER, T0.plusSeconds(60)),
				price(dish, "8.50", ReportSource.OWNER, T0)));

		assertThat(summary.price()).isEqualByComparingTo("10.50");
		assertThat(summary.priceConflict()).isFalse();
	}

	@Test
	void smallDifferencesAreNotConflicts() {
		Dish dish = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.OWNER, null);
		DishResponse summary = MenuService.summarize(dish, List.of(
				price(dish, "9.00", ReportSource.DINER, T0.plusSeconds(60)),
				price(dish, "8.50", ReportSource.OWNER, T0)));
		assertThat(summary.priceConflict()).isFalse();
	}

	@Test
	void withoutAnOfficialPriceTheCommunityPriceIsShown() {
		Dish dish = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.DINER, null);
		DishResponse summary = MenuService.summarize(dish, List.of(price(dish, "9.00", ReportSource.DINER, T0)));
		assertThat(summary.price()).isEqualByComparingTo("9.00");
		assertThat(summary.officialPrice()).isNull();
	}

	private static DishPrice price(Dish dish, String amount, ReportSource source, Instant at) {
		return new DishPrice(dish.getId(), new BigDecimal(amount), source, null, at);
	}
}
