package com.makanmatch.catalog_service.menu;

import java.util.Arrays;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.catalog_service.menu.dto.DishRequest;
import com.makanmatch.catalog_service.menu.dto.DishResponse;
import com.makanmatch.catalog_service.menu.dto.DishUpdateRequest;
import com.makanmatch.catalog_service.menu.dto.PricePointResponse;
import com.makanmatch.catalog_service.menu.dto.PriceReportRequest;
import com.makanmatch.catalog_service.security.Caller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/catalog")
@Tag(name = "Menus", description = "Dishes and their price history (reads are public)")
public class MenuController {

	private static final String ACT_AS = "X-Act-As";

	private final MenuService menus;

	public MenuController(MenuService menus) {
		this.menus = menus;
	}

	@GetMapping("/venues/{venueId}/dishes")
	@Operation(summary = "A venue's current menu with official and community prices")
	public List<DishResponse> menu(@PathVariable String venueId) {
		return menus.menu(venueId);
	}

	@PostMapping("/venues/{venueId}/dishes")
	@ResponseStatus(HttpStatus.CREATED)
	@SecurityRequirement(name = "bearer")
	@Operation(summary = "Add a dish: official when the venue's owner adds it, community otherwise")
	public DishResponse addDish(@AuthenticationPrincipal Jwt jwt, @RequestHeader(name = ACT_AS, required = false) String actAs,
			@PathVariable String venueId, @Valid @RequestBody DishRequest body) {
		return menus.create(venueId, body, Caller.of(jwt, actAs));
	}

	@GetMapping("/dishes")
	@Operation(summary = "Several dishes by id (comma-separated, at most 100)")
	public List<DishResponse> dishes(@RequestParam String ids) {
		List<String> wanted = Arrays.stream(ids.split(",")).map(String::trim).filter(id -> !id.isEmpty()).distinct()
				.toList();
		return menus.getMany(wanted);
	}

	@GetMapping("/dishes/{id}")
	@Operation(summary = "One dish")
	public DishResponse dish(@PathVariable String id) {
		return menus.get(id);
	}

	@PatchMapping("/dishes/{id}")
	@SecurityRequirement(name = "bearer")
	@Operation(summary = "Rename or archive a dish (owners only); it becomes part of the official menu")
	public DishResponse updateDish(@AuthenticationPrincipal Jwt jwt, @RequestHeader(name = ACT_AS, required = false) String actAs,
			@PathVariable String id, @Valid @RequestBody DishUpdateRequest body) {
		return menus.update(id, body, Caller.of(jwt, actAs));
	}

	@GetMapping("/dishes/{id}/prices")
	@Operation(summary = "Every reported price for a dish, newest first")
	public List<PricePointResponse> priceHistory(@PathVariable String id) {
		return menus.priceHistory(id);
	}

	@PostMapping("/dishes/{id}/prices")
	@ResponseStatus(HttpStatus.CREATED)
	@SecurityRequirement(name = "bearer")
	@Operation(summary = "Report a price: official from the owner, what-I-paid from anyone else")
	public PricePointResponse reportPrice(@AuthenticationPrincipal Jwt jwt, @RequestHeader(name = ACT_AS, required = false) String actAs,
			@PathVariable String id, @Valid @RequestBody PriceReportRequest body) {
		return menus.reportPrice(id, body, Caller.of(jwt, actAs));
	}
}
