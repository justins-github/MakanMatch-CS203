package com.makanmatch.catalog_service.menu.dto;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Several menu edits an owner saves together, all or nothing: new official prices
 * for dishes already on the menu, new dishes, and dishes to take off the menu.
 * Missing lists are empty.
 */
public record MenuChangesRequest(
		List<@Valid @NotNull PriceChange> prices,
		List<@Valid @NotNull DishRequest> added,
		List<@NotBlank String> removed) {

	public MenuChangesRequest {
		prices = prices == null ? List.of() : prices;
		added = added == null ? List.of() : added;
		removed = removed == null ? List.of() : removed;
	}

	public int size() {
		return prices.size() + added.size() + removed.size();
	}

	public record PriceChange(
			@NotBlank String dishId,
			@NotNull
			@DecimalMin(value = "0.10", message = "must be at least $0.10")
			@DecimalMax(value = "999.99", message = "must be under $1000") BigDecimal price) {
	}
}
