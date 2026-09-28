package com.makanmatch.catalog_service.menu.dto;

import jakarta.validation.constraints.Size;

/** Owner edit; a null field is left unchanged. Archiving hides the dish but keeps its history. */
public record DishUpdateRequest(
		@Size(min = 1, max = 80) String name,
		Boolean archived) {
}
