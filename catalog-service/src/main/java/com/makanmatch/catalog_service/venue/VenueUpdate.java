package com.makanmatch.catalog_service.venue;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One owner report about a venue. Append-only: history is never edited. */
@Entity
@Table(name = "venue_updates")
public class VenueUpdate {

	@Id
	private UUID id;

	@Column(name = "venue_id", nullable = false)
	private String venueId;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false)
	private VenueStatus status;

	@Column(name = "new_address")
	private String newAddress;

	@Column(name = "opening_hours")
	private String openingHours;

	@Column(name = "note")
	private String note;

	@Column(name = "reported_by", nullable = false)
	private UUID reportedBy;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected VenueUpdate() {
	}

	public VenueUpdate(String venueId, VenueStatus status, String newAddress, String openingHours, String note,
			UUID reportedBy) {
		this(venueId, status, newAddress, openingHours, note, reportedBy, Instant.now());
	}

	VenueUpdate(String venueId, VenueStatus status, String newAddress, String openingHours, String note,
			UUID reportedBy, Instant createdAt) {
		this.id = UUID.randomUUID();
		this.venueId = venueId;
		this.status = status;
		this.newAddress = newAddress;
		this.openingHours = openingHours;
		this.note = note;
		this.reportedBy = reportedBy;
		this.createdAt = createdAt;
	}

	public UUID getId() {
		return id;
	}

	public String getVenueId() {
		return venueId;
	}

	public VenueStatus getStatus() {
		return status;
	}

	public String getNewAddress() {
		return newAddress;
	}

	public String getOpeningHours() {
		return openingHours;
	}

	public String getNote() {
		return note;
	}

	public UUID getReportedBy() {
		return reportedBy;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
