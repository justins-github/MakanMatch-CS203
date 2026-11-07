package com.makanmatch.catalog_service.menu;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.catalog_service.common.BadRequestException;
import com.makanmatch.catalog_service.common.ConflictException;
import com.makanmatch.catalog_service.common.ForbiddenException;
import com.makanmatch.catalog_service.menu.dto.DishRequest;
import com.makanmatch.catalog_service.menu.dto.DishResponse;
import com.makanmatch.catalog_service.menu.dto.DishUpdateRequest;
import com.makanmatch.catalog_service.menu.dto.MenuChangesRequest;
import com.makanmatch.catalog_service.menu.dto.MenuChangesRequest.PriceChange;
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

	@Test
	void ownersRepriceAddAndRemoveDishesInOneGo() {
		Dish wrap = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.SEED, null);
		Dish shish = new Dish("turks-kebab", "Lamb shish", ReportSource.OWNER, null);
		givenLiveMenu(wrap, shish);

		service.applyChanges("turks-kebab", new MenuChangesRequest(
				List.of(new PriceChange(wrap.getId(), new BigDecimal("9.50"))),
				List.of(new DishRequest(" Teh  tarik ", new BigDecimal("1.80"))),
				List.of(shish.getId())), CALLER);

		ArgumentCaptor<DishPrice> saved = ArgumentCaptor.forClass(DishPrice.class);
		verify(prices, times(2)).save(saved.capture());
		assertThat(saved.getAllValues()).allMatch(p -> p.getSource() == ReportSource.OWNER);
		assertThat(saved.getAllValues()).extracting(DishPrice::getPrice)
				.usingElementComparator(BigDecimal::compareTo)
				.containsExactlyInAnyOrder(new BigDecimal("9.50"), new BigDecimal("1.80"));
		assertThat(wrap.getSource()).isEqualTo(ReportSource.OWNER);
		assertThat(shish.isArchived()).isTrue();
		ArgumentCaptor<Dish> added = ArgumentCaptor.forClass(Dish.class);
		verify(dishes).save(added.capture());
		assertThat(added.getValue().getName()).isEqualTo("Teh tarik");
		assertThat(added.getValue().getSource()).isEqualTo(ReportSource.OWNER);
	}

	@Test
	void oneBadChangeMeansNothingIsSaved() {
		Dish wrap = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.SEED, null);
		Dish shish = new Dish("turks-kebab", "Lamb shish", ReportSource.OWNER, null);
		givenLiveMenu(wrap, shish);

		assertThatThrownBy(() -> service.applyChanges("turks-kebab", new MenuChangesRequest(
				List.of(new PriceChange(wrap.getId(), new BigDecimal("9.50"))),
				List.of(new DishRequest("Lamb SHISH", null)),
				List.of(shish.getId())), CALLER))
				.isInstanceOf(ConflictException.class)
				.hasMessage("\"Lamb SHISH\" is already on this menu");

		verify(prices, never()).save(any());
		verify(dishes, never()).save(any());
		assertThat(shish.isArchived()).isFalse();
		assertThat(wrap.getSource()).isEqualTo(ReportSource.SEED);
	}

	@Test
	void dishesFromOtherVenuesCannotBeChanged() {
		givenLiveMenu(new Dish("turks-kebab", "Chicken doner wrap", ReportSource.SEED, null));
		assertThatThrownBy(() -> service.applyChanges("turks-kebab", new MenuChangesRequest(
				List.of(new PriceChange("someone-elses-dish", BigDecimal.TEN)), null, null), CALLER))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("A dish to reprice isn't on this menu");
		verify(prices, never()).save(any());
	}

	@Test
	void aRemovedDishCanBePutBack() {
		Dish wrap = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.OWNER, null);
		wrap.setArchived(true);
		given(dishes.findById(wrap.getId())).willReturn(Optional.of(wrap));

		service.update(wrap.getId(), new DishUpdateRequest(null, false), CALLER);

		assertThat(wrap.isArchived()).isFalse();
		assertThat(wrap.getArchivedAt()).isNull();
	}

	@Test
	void aRemovedDishCannotComeBackOnceItsNameIsOnTheMenuAgain() {
		Dish wrap = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.OWNER, null);
		wrap.setArchived(true);
		given(dishes.findById(wrap.getId())).willReturn(Optional.of(wrap));
		given(dishes.existsByVenueIdAndNameIgnoreCaseAndArchivedFalseAndIdNot("turks-kebab", "Chicken doner wrap", wrap.getId()))
				.willReturn(true);

		assertThatThrownBy(() -> service.update(wrap.getId(), new DishUpdateRequest(null, false), CALLER))
				.isInstanceOf(ConflictException.class)
				.hasMessage("\"Chicken doner wrap\" is already on this menu");
		assertThat(wrap.isArchived()).isTrue();
	}

	@Test
	void removingADishNeverTripsOverItsOwnName() {
		Dish wrap = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.OWNER, null);
		given(dishes.findById(wrap.getId())).willReturn(Optional.of(wrap));

		service.update(wrap.getId(), new DishUpdateRequest(null, true), CALLER);

		assertThat(wrap.isArchived()).isTrue();
		verify(dishes, never()).existsByVenueIdAndNameIgnoreCaseAndArchivedFalseAndIdNot(any(), any(), any());
	}

	@Test
	void theSameNewDishCannotBeAddedTwice() {
		givenLiveMenu();
		assertThatThrownBy(() -> service.applyChanges("turks-kebab", new MenuChangesRequest(null,
				List.of(new DishRequest("Teh tarik", null), new DishRequest("teh tarik", null)), null), CALLER))
				.isInstanceOf(ConflictException.class);
		verify(dishes, never()).save(any());
	}

	@Test
	void aDishCannotBeRepricedAndRemovedAtOnce() {
		Dish wrap = new Dish("turks-kebab", "Chicken doner wrap", ReportSource.SEED, null);
		givenLiveMenu(wrap);
		assertThatThrownBy(() -> service.applyChanges("turks-kebab", new MenuChangesRequest(
				List.of(new PriceChange(wrap.getId(), BigDecimal.TEN)), null, List.of(wrap.getId())), CALLER))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("\"Chicken doner wrap\" can't be repriced and removed at once");
	}

	@Test
	void onlyOwnersCanChangeTheMenu() {
		willThrow(new ForbiddenException("no")).given(access).requireManager(CALLER, "turks-kebab");
		assertThatThrownBy(() -> service.applyChanges("turks-kebab", new MenuChangesRequest(null,
				List.of(new DishRequest("Teh tarik", null)), null), CALLER))
				.isInstanceOf(ForbiddenException.class);
		verify(dishes, never()).save(any());
	}

	@Test
	void anEmptyChangeSetIsRejected() {
		assertThatThrownBy(() -> service.applyChanges("turks-kebab", new MenuChangesRequest(null, null, null), CALLER))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("Nothing to change");
	}

	private void givenLiveMenu(Dish... live) {
		given(dishes.findByVenueIdAndArchivedFalseOrderByNameAsc("turks-kebab")).willReturn(List.of(live));
	}

	private static DishPrice price(Dish dish, String amount, ReportSource source, Instant at) {
		return new DishPrice(dish.getId(), new BigDecimal(amount), source, null, at);
	}
}
