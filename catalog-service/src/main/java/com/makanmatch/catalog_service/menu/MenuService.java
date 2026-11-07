package com.makanmatch.catalog_service.menu;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.catalog_service.common.BadRequestException;
import com.makanmatch.catalog_service.common.ConflictException;
import com.makanmatch.catalog_service.common.NotFoundException;
import com.makanmatch.catalog_service.menu.dto.DishRequest;
import com.makanmatch.catalog_service.menu.dto.DishResponse;
import com.makanmatch.catalog_service.menu.dto.DishUpdateRequest;
import com.makanmatch.catalog_service.menu.dto.MenuChangesRequest;
import com.makanmatch.catalog_service.menu.dto.MenuChangesRequest.PriceChange;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince.ChangedDish;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince.RepricedDish;
import com.makanmatch.catalog_service.menu.dto.PricePointResponse;
import com.makanmatch.catalog_service.menu.dto.PriceReportRequest;
import com.makanmatch.catalog_service.menu.dto.VenuePriceResponse;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.security.VenueAccessPolicy;
import com.makanmatch.catalog_service.security.VenueAccessPolicy.Access;
import com.makanmatch.catalog_service.venue.VenueService;

/**
 * Menus and prices. The same request means different things depending on who
 * sends it: an owner's dish or price is official, a diner's is community data.
 * Both are kept, so the two can be compared (see {@link #summarize}).
 */
@Service
@Transactional
public class MenuService {

	/** Community prices further than this from the official one flag the menu as out of date. */
	static final BigDecimal CONFLICT_THRESHOLD = new BigDecimal("0.15");
	private static final int MAX_BATCH = 100;

	private final DishRepository dishes;
	private final DishPriceRepository prices;
	private final VenueService venues;
	private final VenueAccessPolicy access;

	public MenuService(DishRepository dishes, DishPriceRepository prices, VenueService venues,
			VenueAccessPolicy access) {
		this.dishes = dishes;
		this.prices = prices;
		this.venues = venues;
		this.access = access;
	}

	/** For a deleted account: its dishes and prices stay, unattributed. */
	public void forgetContributor(UUID userId) {
		dishes.forgetCreator(userId);
		prices.forgetReporter(userId);
	}

	@Transactional(readOnly = true)
	public List<DishResponse> menu(String venueId) {
		venues.requireExists(venueId);
		return withPrices(dishes.findByVenueIdAndArchivedFalseOrderByNameAsc(venueId));
	}

	@Transactional(readOnly = true)
	public DishResponse get(String dishId) {
		return withPrices(List.of(find(dishId))).get(0);
	}

	/** Unknown ids are skipped; used by the engine to resolve several dishes at once. */
	@Transactional(readOnly = true)
	public List<DishResponse> getMany(Collection<String> dishIds) {
		if (dishIds.size() > MAX_BATCH) throw new BadRequestException("At most " + MAX_BATCH + " dishes per request");
		return withPrices(dishes.findAllById(dishIds));
	}

	/**
	 * What changed on a venue's menu since a moment (CSD-50). A dish that was both
	 * added and taken off since then isn't listed; dishes archived before archived_at
	 * existed have no removal date, so they never count as removed.
	 */
	@Transactional(readOnly = true)
	public MenuChangesSince changesSince(String venueId, Instant since) {
		venues.requireExists(venueId);
		List<Dish> all = dishes.findByVenueIdOrderByNameAsc(venueId);
		Map<String, List<DishPrice>> byDish = pricesByDish(all);
		List<RepricedDish> repriced = new ArrayList<>();
		List<ChangedDish> added = new ArrayList<>();
		List<ChangedDish> removed = new ArrayList<>();
		List<BigDecimal> pricesThen = new ArrayList<>();
		List<BigDecimal> pricesNow = new ArrayList<>();
		for (Dish dish : all) {
			List<DishPrice> history = byDish.getOrDefault(dish.getId(), List.of());
			boolean isNew = dish.getCreatedAt().isAfter(since);
			boolean goneSince = dish.isArchived() && dish.getArchivedAt() != null && dish.getArchivedAt().isAfter(since);
			if (!dish.isArchived()) addIfPriced(pricesNow, summarize(dish, history).price());
			if (!isNew && (!dish.isArchived() || goneSince)) addIfPriced(pricesThen, shownPriceAt(dish, history, since));
			if (isNew && !dish.isArchived()) {
				added.add(new ChangedDish(dish.getId(), dish.getName(), summarize(dish, history).price(), dish.getCreatedAt()));
			} else if (goneSince && !isNew) {
				removed.add(new ChangedDish(dish.getId(), dish.getName(), null, dish.getArchivedAt()));
			} else if (!dish.isArchived() && !isNew) {
				DishResponse now = summarize(dish, history);
				BigDecimal then = shownPriceAt(dish, history, since);
				// A first price since the visit counts too (from = null): it moves the typical price.
				if (now.price() != null && (then == null || then.compareTo(now.price()) != 0)) {
					repriced.add(new RepricedDish(dish.getId(), dish.getName(), then, now.price(), now.lastPriceAt()));
				}
			}
		}
		added.sort(Comparator.comparing(ChangedDish::at));
		removed.sort(Comparator.comparing(ChangedDish::at));
		return new MenuChangesSince(repriced, added, removed, median(pricesThen), median(pricesNow));
	}

	/** Every venue's typical price: the median shown price of its live dishes (CSD-51). */
	@Transactional(readOnly = true)
	public List<VenuePriceResponse> typicalPrices() {
		List<Dish> live = dishes.findByArchivedFalse();
		Map<String, List<DishPrice>> byDish = pricesByDish(live);
		Map<String, List<BigDecimal>> byVenue = new TreeMap<>();
		for (Dish dish : live) {
			BigDecimal shown = summarize(dish, byDish.getOrDefault(dish.getId(), List.of())).price();
			if (shown != null) byVenue.computeIfAbsent(dish.getVenueId(), v -> new ArrayList<>()).add(shown);
		}
		return byVenue.entrySet().stream().map(e -> new VenuePriceResponse(e.getKey(), median(e.getValue()))).toList();
	}

	/** The price the app showed for a dish at a moment: summarize over the reports made by then. */
	private static BigDecimal shownPriceAt(Dish dish, List<DishPrice> newestFirst, Instant at) {
		return summarize(dish, newestFirst.stream().filter(p -> !p.getReportedAt().isAfter(at)).toList()).price();
	}

	private static void addIfPriced(List<BigDecimal> prices, BigDecimal price) {
		if (price != null) prices.add(price);
	}

	/** Middle value (mean of the two middle ones for an even count), to the cent; null for none. */
	static BigDecimal median(List<BigDecimal> prices) {
		if (prices.isEmpty()) return null;
		List<BigDecimal> sorted = prices.stream().sorted().toList();
		int mid = sorted.size() / 2;
		BigDecimal middle = sorted.size() % 2 == 1 ? sorted.get(mid)
				: sorted.get(mid - 1).add(sorted.get(mid)).divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
		return middle.setScale(2, RoundingMode.HALF_UP);
	}

	@Transactional(readOnly = true)
	public List<PricePointResponse> priceHistory(String dishId) {
		find(dishId);
		return prices.findByDishIdOrderByReportedAtDesc(dishId).stream().map(PricePointResponse::from).toList();
	}

	public DishResponse create(String venueId, DishRequest request, Caller caller) {
		venues.requireExists(venueId);
		ReportSource source = sourceFor(caller, venueId);
		String name = tidy(request.name());
		if (dishes.existsByVenueIdAndNameIgnoreCaseAndArchivedFalse(venueId, name)) {
			throw new ConflictException("\"" + name + "\" is already on this menu");
		}
		Dish dish = dishes.save(new Dish(venueId, name, source, caller.userId()));
		if (request.price() != null) {
			prices.save(new DishPrice(dish.getId(), request.price(), source, caller.userId()));
		}
		return withPrices(List.of(dish)).get(0);
	}

	public DishResponse update(String dishId, DishUpdateRequest request, Caller caller) {
		Dish dish = find(dishId);
		access.requireManager(caller, dish.getVenueId());
		if (request.name() != null) {
			String name = tidy(request.name());
			if (dishes.existsByVenueIdAndNameIgnoreCaseAndArchivedFalseAndIdNot(dish.getVenueId(), name, dishId)) {
				throw new ConflictException("\"" + name + "\" is already on this menu");
			}
			dish.rename(name);
		}
		// Only one live dish can have a name, and it may have been re-added since this one was removed.
		if (Boolean.FALSE.equals(request.archived()) && dish.isArchived()
				&& dishes.existsByVenueIdAndNameIgnoreCaseAndArchivedFalseAndIdNot(dish.getVenueId(), dish.getName(), dishId)) {
			throw new ConflictException("\"" + dish.getName() + "\" is already on this menu");
		}
		if (request.archived() != null) dish.setArchived(request.archived());
		dish.makeOfficial();
		return withPrices(List.of(dish)).get(0);
	}

	public PricePointResponse reportPrice(String dishId, PriceReportRequest request, Caller caller) {
		Dish dish = find(dishId);
		if (dish.isArchived()) throw new ConflictException("This dish is no longer on the menu");
		ReportSource source = sourceFor(caller, dish.getVenueId());
		// An owner confirming the price puts the dish on the official menu.
		if (source == ReportSource.OWNER) dish.makeOfficial();
		return PricePointResponse.from(prices.save(new DishPrice(dishId, request.price(), source, caller.userId())));
	}

	/**
	 * The owner's price list edit, applied all or nothing: every change is checked
	 * before anything is written, and the transaction rolls back on any failure.
	 * New prices and new dishes are official; removed dishes are archived.
	 */
	public List<DishResponse> applyChanges(String venueId, MenuChangesRequest changes, Caller caller) {
		venues.requireExists(venueId);
		access.requireManager(caller, venueId);
		if (changes.size() == 0) throw new BadRequestException("Nothing to change");
		if (changes.size() > MAX_BATCH) throw new BadRequestException("At most " + MAX_BATCH + " changes at once");

		Map<String, Dish> live = dishes.findByVenueIdAndArchivedFalseOrderByNameAsc(venueId).stream()
				.collect(Collectors.toMap(Dish::getId, Function.identity()));
		Set<String> removed = new HashSet<>();
		for (String dishId : changes.removed()) {
			if (!live.containsKey(dishId)) throw new BadRequestException("A dish to remove isn't on this menu");
			removed.add(dishId);
		}
		Set<String> repriced = new HashSet<>();
		for (PriceChange change : changes.prices()) {
			Dish dish = live.get(change.dishId());
			if (dish == null) throw new BadRequestException("A dish to reprice isn't on this menu");
			if (removed.contains(dish.getId())) {
				throw new BadRequestException("\"" + dish.getName() + "\" can't be repriced and removed at once");
			}
			if (!repriced.add(dish.getId())) throw new BadRequestException("\"" + dish.getName() + "\" has two new prices");
		}
		// Names of dishes being removed stay taken: the unique index is checked before the archive lands.
		Set<String> taken = live.values().stream().map(d -> d.getName().toLowerCase(Locale.ROOT))
				.collect(Collectors.toCollection(HashSet::new));
		List<String> newNames = new ArrayList<>();
		for (DishRequest dish : changes.added()) {
			String name = tidy(dish.name());
			if (!taken.add(name.toLowerCase(Locale.ROOT))) throw new ConflictException("\"" + name + "\" is already on this menu");
			newNames.add(name);
		}

		for (String dishId : removed) {
			Dish dish = live.get(dishId);
			dish.setArchived(true);
			dish.makeOfficial();
		}
		for (PriceChange change : changes.prices()) {
			live.get(change.dishId()).makeOfficial();
			prices.save(new DishPrice(change.dishId(), change.price(), ReportSource.OWNER, caller.userId()));
		}
		for (int i = 0; i < newNames.size(); i++) {
			Dish dish = dishes.save(new Dish(venueId, newNames.get(i), ReportSource.OWNER, caller.userId()));
			BigDecimal price = changes.added().get(i).price();
			if (price != null) prices.save(new DishPrice(dish.getId(), price, ReportSource.OWNER, caller.userId()));
		}
		return menu(venueId);
	}

	/**
	 * Official vs community price for one dish. A conflict means diners reported a
	 * price after the owner last set one, and it differs by more than 15%.
	 */
	static DishResponse summarize(Dish dish, List<DishPrice> newestFirst) {
		DishPrice official = newestFirst.stream().filter(p -> p.getSource() == ReportSource.OWNER).findFirst()
				.orElse(null);
		DishPrice community = newestFirst.stream().filter(p -> p.getSource() != ReportSource.OWNER).findFirst()
				.orElse(null);
		boolean conflict = official != null && community != null
				&& community.getReportedAt().isAfter(official.getReportedAt())
				&& relativeDifference(official.getPrice(), community.getPrice()).compareTo(CONFLICT_THRESHOLD) > 0;
		BigDecimal shown = official != null ? official.getPrice() : community != null ? community.getPrice() : null;
		Instant last = newestFirst.isEmpty() ? null : newestFirst.get(0).getReportedAt();
		return new DishResponse(dish.getId(), dish.getVenueId(), dish.getName(), dish.getSource(), dish.isArchived(),
				shown, official == null ? null : official.getPrice(), community == null ? null : community.getPrice(),
				conflict, last);
	}

	private ReportSource sourceFor(Caller caller, String venueId) {
		return access.accessFor(caller, venueId) == Access.MANAGER ? ReportSource.OWNER : ReportSource.DINER;
	}

	private List<DishResponse> withPrices(List<Dish> found) {
		if (found.isEmpty()) return List.of();
		Map<String, List<DishPrice>> byDish = pricesByDish(found);
		return found.stream().map(dish -> summarize(dish, byDish.getOrDefault(dish.getId(), List.of()))).toList();
	}

	/** One query for the dishes' prices, newest first, grouped per dish. */
	private Map<String, List<DishPrice>> pricesByDish(List<Dish> found) {
		if (found.isEmpty()) return Map.of();
		return prices.findByDishIdInOrderByReportedAtDesc(found.stream().map(Dish::getId).toList())
				.stream().collect(Collectors.groupingBy(DishPrice::getDishId));
	}

	private Dish find(String dishId) {
		return dishes.findById(dishId).orElseThrow(() -> new NotFoundException("No such dish"));
	}

	private static BigDecimal relativeDifference(BigDecimal reference, BigDecimal other) {
		return other.subtract(reference).abs().divide(reference, 4, RoundingMode.HALF_UP);
	}

	/** Trims and collapses inner whitespace so "Chicken  rice " and "Chicken rice" match. */
	static String normalizeName(String name) {
		return name == null ? "" : name.trim().replaceAll("\\s+", " ");
	}

	private static String tidy(String name) {
		String cleaned = normalizeName(name);
		if (cleaned.isEmpty()) throw new BadRequestException("Dish name can't be blank");
		return cleaned;
	}
}
