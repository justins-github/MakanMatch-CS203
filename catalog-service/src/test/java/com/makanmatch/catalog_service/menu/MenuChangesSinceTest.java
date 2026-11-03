package com.makanmatch.catalog_service.menu;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.catalog_service.menu.dto.MenuChangesRequest;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.security.VenueAccessPolicy;
import com.makanmatch.catalog_service.venue.VenueService;

/** CSD-50: what changed on a venue's menu since a diner's last visit. */
@ExtendWith(MockitoExtension.class)
class MenuChangesSinceTest {

	private static final Instant T0 = Instant.parse("2026-10-01T00:00:00Z");
	private static final Instant VISIT = T0.plus(Duration.ofDays(10));
	private static final Caller OWNER = new Caller(UUID.randomUUID(), "token", null);

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
		lenient().when(prices.findByDishIdInOrderByReportedAtDesc(any())).thenReturn(List.of());
	}

	@Test
	void anOfficialPriceChangeSinceTheVisitIsListed() {
		Dish wrap = dish("Chicken doner wrap", T0);
		givenMenu(wrap);
		givenPrices(price(wrap, "10.50", ReportSource.OWNER, VISIT.plus(Duration.ofDays(2))),
				price(wrap, "8.50", ReportSource.OWNER, T0));

		MenuChangesSince changes = service.changesSince("turks-kebab", VISIT);

		assertThat(changes.repriced()).singleElement().satisfies(c -> {
			assertThat(c.name()).isEqualTo("Chicken doner wrap");
			assertThat(c.from()).isEqualByComparingTo("8.50");
			assertThat(c.to()).isEqualByComparingTo("10.50");
		});
		assertThat(changes.added()).isEmpty();
		assertThat(changes.removed()).isEmpty();
	}

	@Test
	void theComparisonUsesThePriceTheAppShowsWhichPrefersTheOwners() {
		Dish wrap = dish("Chicken doner wrap", T0);
		givenMenu(wrap);
		givenPrices(price(wrap, "10.50", ReportSource.DINER, VISIT.plus(Duration.ofDays(2))),
				price(wrap, "8.50", ReportSource.OWNER, T0));
		assertThat(service.changesSince("turks-kebab", VISIT).repriced()).isEmpty();
	}

	@Test
	void aDinerPriceChangesTheShownPriceWhenThereIsNoOfficialOne() {
		Dish laksa = dish("Secret laksa", T0);
		givenMenu(laksa);
		givenPrices(price(laksa, "14.00", ReportSource.DINER, VISIT.plus(Duration.ofDays(1))),
				price(laksa, "12.00", ReportSource.DINER, T0));
		assertThat(service.changesSince("turks-kebab", VISIT).repriced()).singleElement()
				.satisfies(c -> assertThat(c.to()).isEqualByComparingTo("14.00"));
	}

	@Test
	void aDishAddedSinceTheVisitIsNew() {
		Dish shish = dish("Lamb shish", VISIT.plus(Duration.ofDays(1)));
		givenMenu(shish);
		givenPrices(price(shish, "13.00", ReportSource.OWNER, VISIT.plus(Duration.ofDays(1))));
		assertThat(service.changesSince("turks-kebab", VISIT).added()).singleElement().satisfies(d -> {
			assertThat(d.name()).isEqualTo("Lamb shish");
			assertThat(d.price()).isEqualByComparingTo("13.00");
		});
	}

	@Test
	void aDishRemovedSinceTheVisitIsGoneButOneRemovedBeforeIsNot() {
		Dish iskender = dish("Iskender kebab", T0);
		iskender.setArchived(true, VISIT.plus(Duration.ofDays(3)));
		Dish oldOne = dish("Old special", T0);
		oldOne.setArchived(true, VISIT.minus(Duration.ofDays(3)));
		givenMenu(iskender, oldOne);
		MenuChangesSince changes = service.changesSince("turks-kebab", VISIT);
		assertThat(changes.removed()).extracting("name").containsExactly("Iskender kebab");
	}

	@Test
	void aDishThatCameAndWentSinceTheVisitIsNotListed() {
		Dish brief = dish("Pop-up special", VISIT.plus(Duration.ofDays(1)));
		brief.setArchived(true, VISIT.plus(Duration.ofDays(2)));
		givenMenu(brief);
		MenuChangesSince changes = service.changesSince("turks-kebab", VISIT);
		assertThat(changes.added()).isEmpty();
		assertThat(changes.removed()).isEmpty();
	}

	@Test
	void theTypicalPriceThenAndNowIsTheMedianShownPriceOfWhatWasOnTheMenu() {
		Dish wrap = dish("Chicken doner wrap", T0);
		Dish ayran = dish("Ayran", T0);
		Dish shish = dish("Lamb shish", VISIT.plus(Duration.ofDays(1)));
		givenMenu(wrap, ayran, shish);
		givenPrices(price(wrap, "10.50", ReportSource.OWNER, VISIT.plus(Duration.ofDays(2))),
				price(shish, "13.00", ReportSource.OWNER, VISIT.plus(Duration.ofDays(1))),
				price(wrap, "8.50", ReportSource.OWNER, T0),
				price(ayran, "3.00", ReportSource.OWNER, T0));

		MenuChangesSince changes = service.changesSince("turks-kebab", VISIT);

		assertThat(changes.priceThen()).isEqualByComparingTo("5.75"); // 3.00 and 8.50
		assertThat(changes.priceNow()).isEqualByComparingTo("10.50"); // 3.00, 10.50 and 13.00
	}

	@Test
	void aDishPricedForTheFirstTimeSinceTheVisitIsListedWithNoOldPrice() {
		Dish rice = dish("Chicken rice", T0);
		givenMenu(rice);
		givenPrices(price(rice, "15.00", ReportSource.DINER, VISIT.plus(Duration.ofDays(1))));
		assertThat(service.changesSince("turks-kebab", VISIT).repriced()).singleElement().satisfies(c -> {
			assertThat(c.from()).isNull();
			assertThat(c.to()).isEqualByComparingTo("15.00");
		});
	}

	@Test
	void aDishRemovedSinceTheVisitStillCountsTowardsThePriceThen() {
		Dish wrap = dish("Chicken doner wrap", T0);
		Dish iskender = dish("Iskender", T0);
		iskender.setArchived(true, VISIT.plus(Duration.ofDays(1)));
		givenMenu(wrap, iskender);
		givenPrices(price(wrap, "8.00", ReportSource.OWNER, T0), price(iskender, "14.00", ReportSource.OWNER, T0));
		MenuChangesSince changes = service.changesSince("turks-kebab", VISIT);
		assertThat(changes.priceThen()).isEqualByComparingTo("11.00");
		assertThat(changes.priceNow()).isEqualByComparingTo("8.00");
	}

	@Test
	void aMenuWithNoPricesHasNoTypicalPrice() {
		givenMenu(dish("Mystery special", T0));
		MenuChangesSince changes = service.changesSince("turks-kebab", VISIT);
		assertThat(changes.priceThen()).isNull();
		assertThat(changes.priceNow()).isNull();
	}

	@Test
	void eachVenuesTypicalPriceIsTheMedianShownPriceOfItsLiveDishes() {
		Dish wrap = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.OWNER, null, T0);
		Dish ayran = new Dish("turks-kebab", "Ayran", ReportSource.OWNER, null, T0);
		Dish iskender = new Dish("turks-kebab", "Iskender", ReportSource.OWNER, null, T0);
		Dish soto = new Dish("selegie-soto", "Soto ayam", ReportSource.SEED, null, T0);
		Dish unpriced = new Dish("selegie-soto", "Begedil", ReportSource.DINER, null, T0);
		given(dishes.findByArchivedFalse()).willReturn(List.of(wrap, ayran, iskender, soto, unpriced));
		givenPrices(price(wrap, "10.50", ReportSource.DINER, T0.plusSeconds(60)), price(wrap, "8.50", ReportSource.OWNER, T0),
				price(ayran, "3.00", ReportSource.OWNER, T0), price(iskender, "14.00", ReportSource.OWNER, T0),
				price(soto, "4.50", ReportSource.SEED, T0));

		assertThat(service.typicalPrices()).extracting("venueId", "typicalPrice")
				.containsExactlyInAnyOrder(
						org.assertj.core.groups.Tuple.tuple("turks-kebab", new BigDecimal("8.50")),
						org.assertj.core.groups.Tuple.tuple("selegie-soto", new BigDecimal("4.50")));
	}

	@Test
	void nothingChangedMeansEmptyLists() {
		Dish wrap = dish("Chicken doner wrap", T0);
		givenMenu(wrap);
		givenPrices(price(wrap, "8.50", ReportSource.OWNER, T0));
		MenuChangesSince changes = service.changesSince("turks-kebab", VISIT);
		assertThat(changes.repriced()).isEmpty();
		assertThat(changes.added()).isEmpty();
		assertThat(changes.removed()).isEmpty();
	}

	@Test
	void removingADishRecordsWhenAndPuttingItBackClearsIt() {
		Dish wrap = dish("Chicken doner wrap", T0);
		given(dishes.findByVenueIdAndArchivedFalseOrderByNameAsc("turks-kebab")).willReturn(List.of(wrap));
		service.applyChanges("turks-kebab", new MenuChangesRequest(null, null, List.of(wrap.getId())), OWNER);
		assertThat(wrap.getArchivedAt()).isNotNull();
		wrap.setArchived(false);
		assertThat(wrap.getArchivedAt()).isNull();
	}

	private void givenMenu(Dish... all) {
		given(dishes.findByVenueIdOrderByNameAsc("turks-kebab")).willReturn(List.of(all));
	}

	private void givenPrices(DishPrice... newestFirst) {
		given(prices.findByDishIdInOrderByReportedAtDesc(any())).willReturn(List.of(newestFirst));
	}

	private static Dish dish(String name, Instant createdAt) {
		return new Dish("turks-kebab", name, ReportSource.OWNER, null, createdAt);
	}

	private static DishPrice price(Dish dish, String amount, ReportSource source, Instant at) {
		return new DishPrice(dish.getId(), new BigDecimal(amount), source, null, at);
	}
}
