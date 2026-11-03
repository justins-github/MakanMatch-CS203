package com.makanmatch.catalog_service.menu.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** @param price optional; the price the caller paid (diner) or charges (owner), in S$ */
public record DishRequest(
		@NotBlank @Size(max = 80) String name,
		@DecimalMin(value = "0.10", message = "must be at least $0.10")
		@DecimalMax(value = "999.99", message = "must be under $1000") BigDecimal price) {
}
