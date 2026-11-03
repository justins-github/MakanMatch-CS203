package com.makanmatch.catalog_service.venue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.catalog_service.common.BadRequestException;
import com.makanmatch.catalog_service.common.ForbiddenException;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.security.VenueAccessPolicy;
import com.makanmatch.catalog_service.venue.dto.DayHours;
import com.makanmatch.catalog_service.venue.dto.OpeningHoursRequest;
import com.makanmatch.catalog_service.venue.dto.OpeningHoursResponse;
import com.makanmatch.catalog_service.venue.dto.TimeRange;

@ExtendWith(MockitoExtension.class)
class OpeningHoursServiceTest {

	private static final Caller OWNER = new Caller(UUID.randomUUID(), "token", null);
	private static final String VENUE = "moona-thai";

	@Mock
	OpeningSessionRepository sessions;
	@Mock
	VenueService venues;
	@Mock
	VenueAccessPolicy access;

	OpeningHoursService service;

	@BeforeEach
	void setUp() {
		service = new OpeningHoursService(sessions, venues, access);
		lenient().when(sessions.saveAll(anyList())).thenAnswer(call -> new ArrayList<>(call.<List<?>>getArgument(0)));
	}

	@Test
	void ownersSetTheirWeekAndDaysLeftOutAreClosed() {
		OpeningHoursResponse saved = service.replace(VENUE, week(
				day(DayOfWeek.MONDAY, "17:30", "21:00", "11:00", "14:30"),
				day(DayOfWeek.TUESDAY, "11:00", "21:00")), OWNER);

		verify(sessions).deleteByVenueId(VENUE);
		assertThat(saved.week()).hasSize(7);
		assertThat(saved.week().get(0).sessions())
				.containsExactly(new TimeRange("11:00", "14:30"), new TimeRange("17:30", "21:00"));
		assertThat(saved.week().get(6)).isEqualTo(new DayHours(DayOfWeek.SUNDAY, List.of()));
		assertThat(saved.updatedAt()).isNotNull();
	}

	@Test
	void aSessionCanRunPastMidnight() {
		OpeningHoursResponse saved = service.replace(VENUE, week(day(DayOfWeek.FRIDAY, "18:00", "02:00")), OWNER);
		assertThat(saved.week().get(4).sessions()).containsExactly(new TimeRange("18:00", "02:00"));
	}

	@Test
	void theSameOpeningAndClosingTimeMeansOpen24Hours() {
		OpeningHoursResponse saved = service.replace(VENUE, week(day(DayOfWeek.SATURDAY, "00:00", "00:00")), OWNER);
		assertThat(saved.week().get(5).sessions()).containsExactly(new TimeRange("00:00", "00:00"));
	}

	@Test
	void aDayHasAtMostTwoSessions() {
		assertRejected(week(day(DayOfWeek.MONDAY, "07:00", "09:00", "11:00", "14:00", "17:00", "21:00")),
				"Monday can have at most 2 opening times");
	}

	@Test
	void sessionsOnTheSameDayCannotOverlap() {
		assertRejected(week(day(DayOfWeek.MONDAY, "11:00", "15:00", "14:00", "21:00")),
				"Monday's opening times overlap");
	}

	@Test
	void onlyTheLastSessionOfADayCanRunPastMidnight() {
		assertRejected(week(day(DayOfWeek.MONDAY, "08:00", "01:00", "11:00", "14:00")),
				"Monday's opening times overlap");
	}

	@Test
	void backToBackSessionsAreFine() {
		OpeningHoursResponse saved = service.replace(VENUE,
				week(day(DayOfWeek.MONDAY, "11:00", "14:00", "14:00", "21:00")), OWNER);
		assertThat(saved.week().get(0).sessions()).hasSize(2);
	}

	@Test
	void aDayOpen24HoursHasNoOtherSessions() {
		assertRejected(week(day(DayOfWeek.SUNDAY, "00:00", "00:00", "11:00", "14:00")),
				"Sunday is open 24 hours, so it can't have other opening times");
	}

	@Test
	void aDayCannotBeListedTwice() {
		assertRejected(week(day(DayOfWeek.MONDAY, "11:00", "14:00"), day(DayOfWeek.MONDAY, "17:00", "21:00")),
				"Monday is listed twice");
	}

	@Test
	void onlyOwnersCanSetHours() {
		willThrow(new ForbiddenException("no")).given(access).requireManager(OWNER, VENUE);
		assertThatThrownBy(() -> service.replace(VENUE, week(day(DayOfWeek.MONDAY, "11:00", "14:00")), OWNER))
				.isInstanceOf(ForbiddenException.class);
		verify(sessions, never()).deleteByVenueId(any());
	}

	@Test
	void aWeekWithNoOpeningTimesClearsTheHours() {
		OpeningHoursResponse saved = service.replace(VENUE, week(day(DayOfWeek.MONDAY)), OWNER);

		verify(sessions).deleteByVenueId(VENUE);
		assertThat(saved.week()).isEmpty();
		assertThat(saved.updatedAt()).isNull();
	}

	@Test
	void hoursNobodySetAreUnknownNotClosed() {
		given(sessions.findByVenueIdOrderByDayOfWeekAscOpensAsc(VENUE)).willReturn(List.of());
		OpeningHoursResponse hours = service.get(VENUE);
		assertThat(hours.week()).isEmpty();
		assertThat(hours.updatedAt()).isNull();
	}

	@Test
	void everyVenuesHoursComeBackGroupedByVenue() {
		Instant at = Instant.parse("2026-09-28T00:00:00Z");
		given(sessions.findAllByOrderByVenueIdAscDayOfWeekAscOpensAsc()).willReturn(List.of(
				new OpeningSession("a-venue", DayOfWeek.MONDAY, LocalTime.of(11, 0), LocalTime.of(14, 0), null, at),
				new OpeningSession("a-venue", DayOfWeek.TUESDAY, LocalTime.of(11, 0), LocalTime.of(14, 0), null, at),
				new OpeningSession("b-venue", DayOfWeek.MONDAY, LocalTime.of(7, 0), LocalTime.of(12, 0), null, at)));

		List<OpeningHoursResponse> all = service.all();

		assertThat(all).extracting(OpeningHoursResponse::venueId).containsExactly("a-venue", "b-venue");
		assertThat(all.get(0).week().get(1).sessions()).containsExactly(new TimeRange("11:00", "14:00"));
	}

	private void assertRejected(OpeningHoursRequest request, String message) {
		assertThatThrownBy(() -> service.replace(VENUE, request, OWNER))
				.isInstanceOf(BadRequestException.class)
				.hasMessage(message);
		verify(sessions, never()).deleteByVenueId(any());
	}

	private static OpeningHoursRequest week(DayHours... days) {
		return new OpeningHoursRequest(List.of(days));
	}

	/** day(MONDAY, "11:00", "14:30", "17:30", "21:00") = two sessions. */
	private static DayHours day(DayOfWeek day, String... times) {
		List<TimeRange> ranges = new ArrayList<>();
		for (int i = 0; i < times.length; i += 2) ranges.add(new TimeRange(times[i], times[i + 1]));
		return new DayHours(day, ranges);
	}
}
