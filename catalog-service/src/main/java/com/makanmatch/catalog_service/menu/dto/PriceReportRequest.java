package com.makanmatch.catalog_service.menu.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/** An owner reporting this becomes the official price; anyone else reports what they paid. */
public record PriceReportRequest(
		@NotNull
		@DecimalMin(value = "0.10", message = "must be at least $0.10")
		@DecimalMax(value = "999.99", message = "must be under $1000") BigDecimal price) {
}
