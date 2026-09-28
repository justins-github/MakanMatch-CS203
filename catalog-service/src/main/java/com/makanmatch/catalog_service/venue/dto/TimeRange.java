package com.makanmatch.catalog_service.venue.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * One stretch of opening time, as 24-hour "HH:mm". A closing time earlier than the
 * opening time runs past midnight (a supper place open 18:00-02:00); the same time
 * for both means open 24 hours.
 */
public record TimeRange(
		@NotNull @Pattern(regexp = TimeRange.HH_MM, message = "must be a time like 09:30") String opens,
		@NotNull @Pattern(regexp = TimeRange.HH_MM, message = "must be a time like 21:30") String closes) {

	static final String HH_MM = "([01]\\d|2[0-3]):[0-5]\\d";
}
