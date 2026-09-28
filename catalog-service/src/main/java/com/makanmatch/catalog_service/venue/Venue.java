package com.makanmatch.catalog_service.venue;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A place in the registry. Read-only to the API: rows are written by
 * scripts/load-venues.mjs from the Overture snapshot and the curated seeds.
 * Owner-reported changes live in {@link VenueUpdate}, never here.
 */
@Entity
@Table(name = "venues")
public class Venue {

	@Id
	private String id;

	@Column(name = "name", nullable = false)
	private String name;

	@Column(name = "address")
	private String address;

	@Column(name = "postcode")
	private String postcode;

	@Column(name = "lat")
	private Double lat;

	@Column(name = "lon")
	private Double lon;

	@Column(name = "cuisine")
	private String cuisine;

	@Column(name = "category")
	private String category;

	/** overture, community or community+overture. */
	@Column(name = "source", nullable = false)
	private String source;

	/** Overture's confidence that the place exists, 0-1. */
	@Column(name = "confidence")
	private Double confidence;

	/** When the open-data source last touched this record. */
	@Column(name = "source_updated_at")
	private Instant sourceUpdatedAt;

	@Column(name = "loaded_at", nullable = false)
	private Instant loadedAt;

	protected Venue() {
	}

	public Venue(String id, String name, String source) {
		this.id = id;
		this.name = name;
		this.source = source;
		this.loadedAt = Instant.now();
	}

	public String getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getAddress() {
		return address;
	}

	public String getPostcode() {
		return postcode;
	}

	public Double getLat() {
		return lat;
	}

	public Double getLon() {
		return lon;
	}

	public String getCuisine() {
		return cuisine;
	}

	public String getCategory() {
		return category;
	}

	public String getSource() {
		return source;
	}

	public Double getConfidence() {
		return confidence;
	}

	public Instant getSourceUpdatedAt() {
		return sourceUpdatedAt;
	}

	public Instant getLoadedAt() {
		return loadedAt;
	}
}
