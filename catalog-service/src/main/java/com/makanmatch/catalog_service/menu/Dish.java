package com.makanmatch.catalog_service.menu;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "dishes")
public class Dish {

	@Id
	private String id;

	@Column(name = "venue_id", nullable = false)
	private String venueId;

	@Column(name = "name", nullable = false)
	private String name;

	@Enumerated(EnumType.STRING)
	@Column(name = "source", nullable = false)
	private ReportSource source;

	@Column(name = "created_by")
	private UUID createdBy;

	@Column(name = "archived", nullable = false)
	private boolean archived;

	/** When it came off the menu; null while it's on it. */
	@Column(name = "archived_at")
	private Instant archivedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected Dish() {
	}

	public Dish(String venueId, String name, ReportSource source, UUID createdBy) {
		this(venueId, name, source, createdBy, Instant.now());
	}

	Dish(String venueId, String name, ReportSource source, UUID createdBy, Instant createdAt) {
		this.id = UUID.randomUUID().toString();
		this.venueId = venueId;
		this.name = name;
		this.source = source;
		this.createdBy = createdBy;
		this.createdAt = createdAt;
	}

	public void rename(String name) {
		this.name = name;
	}

	public void setArchived(boolean archived) {
		setArchived(archived, Instant.now());
	}

	/** Archiving records when; archiving again keeps the first time; un-archiving clears it. */
	void setArchived(boolean archived, Instant at) {
		if (archived && !this.archived) this.archivedAt = at;
		if (!archived) this.archivedAt = null;
		this.archived = archived;
	}

	/** Once the owner edits a dish, it is part of the official menu. */
	public void makeOfficial() {
		this.source = ReportSource.OWNER;
	}

	public String getId() {
		return id;
	}

	public String getVenueId() {
		return venueId;
	}

	public String getName() {
		return name;
	}

	public ReportSource getSource() {
		return source;
	}

	public UUID getCreatedBy() {
		return createdBy;
	}

	public boolean isArchived() {
		return archived;
	}

	public Instant getArchivedAt() {
		return archivedAt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
