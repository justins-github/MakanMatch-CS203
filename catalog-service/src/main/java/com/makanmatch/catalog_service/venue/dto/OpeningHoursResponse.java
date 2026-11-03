package com.makanmatch.catalog_service.venue.dto;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import com.makanmatch.catalog_service.venue.OpeningSession;

/**
 * A venue's weekly hours as its owner set them: all seven days, Monday first, or
 * an empty week when the owner never set any (most venues - the open data has no
 * hours), which diners should read as "unknown", not "closed".
 */
public record OpeningHoursResponse(String venueId, List<DayHours> week, Instant updatedAt) {

	private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

	public static OpeningHoursResponse from(String venueId, List<OpeningSession> sessions) {
		if (sessions.isEmpty()) return new OpeningHoursResponse(venueId, List.of(), null);
		Map<DayOfWeek, List<TimeRange>> byDay = new EnumMap<>(DayOfWeek.class);
		for (DayOfWeek day : DayOfWeek.values()) byDay.put(day, new ArrayList<>());
		sessions.stream()
				.sorted(Comparator.comparing(OpeningSession::getDay).thenComparing(OpeningSession::getOpens))
				.forEach(s -> byDay.get(s.getDay())
						.add(new TimeRange(s.getOpens().format(HH_MM), s.getCloses().format(HH_MM))));
		Instant updatedAt = sessions.stream().map(OpeningSession::getSetAt).max(Comparator.naturalOrder()).get();
		List<DayHours> week = byDay.entrySet().stream()
				.map(e -> new DayHours(e.getKey(), List.copyOf(e.getValue())))
				.toList();
		return new OpeningHoursResponse(venueId, week, updatedAt);
	}
}
