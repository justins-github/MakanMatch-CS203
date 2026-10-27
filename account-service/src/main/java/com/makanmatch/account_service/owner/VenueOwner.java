package com.makanmatch.account_service.owner;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One account allowed to manage one venue. */
@Entity
@Table(name = "venue_owners")
public class VenueOwner {

	@Id
	private UUID id;

	@Column(name = "venue_id", nullable = false)
	private String venueId;

	@Column(name = "venue_name", nullable = false)
	private String venueName;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	/** The approved claim this came from; null when granted by the seed script. */
	@Column(name = "claim_id")
	private UUID claimId;

	@Column(name = "granted_at", nullable = false)
	private Instant grantedAt;

	protected VenueOwner() {
	}

	public VenueOwner(String venueId, String venueName, UUID userId, UUID claimId) {
		this.id = UUID.randomUUID();
		this.venueId = venueId;
		this.venueName = venueName;
		this.userId = userId;
		this.claimId = claimId;
		this.grantedAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public String getVenueId() {
		return venueId;
	}

	public String getVenueName() {
		return venueName;
	}

	public UUID getUserId() {
		return userId;
	}

	public UUID getClaimId() {
		return claimId;
	}

	public Instant getGrantedAt() {
		return grantedAt;
	}
}
