package com.makanmatch.catalog_service.menu;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.catalog_service.common.BadRequestException;
import com.makanmatch.catalog_service.common.ConflictException;
import com.makanmatch.catalog_service.common.NotFoundException;
import com.makanmatch.catalog_service.menu.dto.DishRequest;
import com.makanmatch.catalog_service.menu.dto.DishResponse;
import com.makanmatch.catalog_service.menu.dto.DishUpdateRequest;
import com.makanmatch.catalog_service.menu.dto.PricePointResponse;
import com.makanmatch.catalog_service.menu.dto.PriceReportRequest;
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
		Map<String, List<DishPrice>> byDish = prices
				.findByDishIdInOrderByReportedAtDesc(found.stream().map(Dish::getId).toList())
				.stream().collect(Collectors.groupingBy(DishPrice::getDishId));
		return found.stream().map(dish -> summarize(dish, byDish.getOrDefault(dish.getId(), List.of()))).toList();
	}

	private Dish find(String dishId) {
		return dishes.findById(dishId).orElseThrow(() -> new NotFoundException("No such dish"));
	}

	private static BigDecimal relativeDifference(BigDecimal reference, BigDecimal other) {
		return other.subtract(reference).abs().divide(reference, 4, RoundingMode.HALF_UP);
	}

	/** Trims and collapses inner whitespace so "Chicken  rice " and "Chicken rice" match. */
	private static String tidy(String name) {
		String cleaned = name.trim().replaceAll("\\s+", " ");
		if (cleaned.isEmpty()) throw new BadRequestException("Dish name can't be blank");
		return cleaned;
	}
}
