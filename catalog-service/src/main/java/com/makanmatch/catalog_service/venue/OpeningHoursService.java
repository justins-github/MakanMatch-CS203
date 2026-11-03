package com.makanmatch.catalog_service.venue;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.catalog_service.common.BadRequestException;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.security.VenueAccessPolicy;
import com.makanmatch.catalog_service.venue.dto.DayHours;
import com.makanmatch.catalog_service.venue.dto.OpeningHoursRequest;
import com.makanmatch.catalog_service.venue.dto.OpeningHoursResponse;

/**
 * Weekly opening hours, set by the venue's owner. Kept apart from status reports
 * so "we're closed for renovation" doesn't wipe the hours, and structured so the
 * engine can tell whether a venue is open right now.
 */
@Service
@Transactional
public class OpeningHoursService {

	/** Enough for a hawker stall's lunch and dinner service. */
	static final int MAX_SESSIONS_PER_DAY = 2;

	private final OpeningSessionRepository sessions;
	private final VenueService venues;
	private final VenueAccessPolicy access;

	public OpeningHoursService(OpeningSessionRepository sessions, VenueService venues, VenueAccessPolicy access) {
		this.sessions = sessions;
		this.venues = venues;
		this.access = access;
	}

	/** For a deleted account: the hours it set stay, unattributed. */
	public void forgetSetter(UUID userId) {
		sessions.forgetSetter(userId);
	}

	@Transactional(readOnly = true)
	public OpeningHoursResponse get(String venueId) {
		venues.requireExists(venueId);
		return OpeningHoursResponse.from(venueId, sessions.findByVenueIdOrderByDayOfWeekAscOpensAsc(venueId));
	}

	/** Every venue with hours; the engine polls this to leave out venues that are closed right now. */
	@Transactional(readOnly = true)
	public List<OpeningHoursResponse> all() {
		Map<String, List<OpeningSession>> byVenue = sessions.findAllByOrderByVenueIdAscDayOfWeekAscOpensAsc().stream()
				.collect(Collectors.groupingBy(OpeningSession::getVenueId, LinkedHashMap::new, Collectors.toList()));
		return byVenue.entrySet().stream().map(e -> OpeningHoursResponse.from(e.getKey(), e.getValue())).toList();
	}

	public OpeningHoursResponse replace(String venueId, OpeningHoursRequest request, Caller caller) {
		venues.requireExists(venueId);
		access.requireManager(caller, venueId);
		List<OpeningSession> week = toSessions(venueId, request.week(), caller.userId(), Instant.now());
		sessions.deleteByVenueId(venueId);
		return OpeningHoursResponse.from(venueId, sessions.saveAll(week));
	}

	private static List<OpeningSession> toSessions(String venueId, List<DayHours> week, UUID setBy, Instant setAt) {
		Set<DayOfWeek> seen = EnumSet.noneOf(DayOfWeek.class);
		List<OpeningSession> result = new ArrayList<>();
		for (DayHours day : week) {
			String name = day.day().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
			if (!seen.add(day.day())) throw new BadRequestException(name + " is listed twice");
			if (day.sessions().size() > MAX_SESSIONS_PER_DAY) {
				throw new BadRequestException(name + " can have at most " + MAX_SESSIONS_PER_DAY + " opening times");
			}
			List<OpeningSession> sorted = day.sessions().stream()
					.map(r -> new OpeningSession(venueId, day.day(), LocalTime.parse(r.opens()),
							LocalTime.parse(r.closes()), setBy, setAt))
					.sorted(Comparator.comparing(OpeningSession::getOpens))
					.toList();
			requireNoOverlap(name, sorted);
			result.addAll(sorted);
		}
		return result;
	}

	/** Sessions sorted by opening time; only the day's last one may run past midnight. */
	private static void requireNoOverlap(String day, List<OpeningSession> sorted) {
		if (sorted.size() > 1 && sorted.stream().anyMatch(OpeningSession::isOpenAllDay)) {
			throw new BadRequestException(day + " is open 24 hours, so it can't have other opening times");
		}
		for (int i = 1; i < sorted.size(); i++) {
			OpeningSession earlier = sorted.get(i - 1);
			if (earlier.runsPastMidnight() || sorted.get(i).getOpens().isBefore(earlier.getCloses())) {
				throw new BadRequestException(day + "'s opening times overlap");
			}
		}
	}
}
