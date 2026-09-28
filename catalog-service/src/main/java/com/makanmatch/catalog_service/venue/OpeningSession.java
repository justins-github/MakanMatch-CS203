package com.makanmatch.catalog_service.venue;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One stretch of a venue's weekly opening hours, e.g. Monday 11:00-14:30. */
@Entity
@Table(name = "opening_hours")
public class OpeningSession {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "venue_id", nullable = false)
	private String venueId;

	/** ISO day number, 1 = Monday. */
	@Column(name = "day_of_week", nullable = false)
	private short dayOfWeek;

	@Column(name = "opens", nullable = false)
	private LocalTime opens;

	@Column(name = "closes", nullable = false)
	private LocalTime closes;

	@Column(name = "set_by")
	private UUID setBy;

	@Column(name = "set_at", nullable = false, updatable = false)
	private Instant setAt;

	protected OpeningSession() {
	}

	public OpeningSession(String venueId, DayOfWeek day, LocalTime opens, LocalTime closes, UUID setBy,
			Instant setAt) {
		this.venueId = venueId;
		this.dayOfWeek = (short) day.getValue();
		this.opens = opens;
		this.closes = closes;
		this.setBy = setBy;
		this.setAt = setAt;
	}

	public boolean isOpenAllDay() {
		return closes.equals(opens);
	}

	public boolean runsPastMidnight() {
		return closes.isBefore(opens);
	}

	public String getVenueId() {
		return venueId;
	}

	public DayOfWeek getDay() {
		return DayOfWeek.of(dayOfWeek);
	}

	public LocalTime getOpens() {
		return opens;
	}

	public LocalTime getCloses() {
		return closes;
	}

	public Instant getSetAt() {
		return setAt;
	}
}
