package com.makanmatch.catalog_service.venue.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A venue's whole week, replacing whatever was there. Days left out are closed;
 * a week with no opening times at all clears the hours (back to "unknown").
 */
public record OpeningHoursRequest(@NotNull @Size(max = 7) List<@Valid @NotNull DayHours> week) {
}
