package com.makanmatch.catalog_service.venue.dto;

import java.time.DayOfWeek;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/** One day's opening times; an empty list means closed that day. */
public record DayHours(@NotNull DayOfWeek day, @NotNull List<@Valid @NotNull TimeRange> sessions) {
}
