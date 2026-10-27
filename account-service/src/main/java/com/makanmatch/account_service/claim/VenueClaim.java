package com.makanmatch.account_service.claim;

import java.time.Instant;
import java.util.UUID;

import com.makanmatch.account_service.common.ConflictException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * "I own this venue", with free-text proof for an admin to check. Only a
 * PENDING claim can change state; every decision records who made it and when.
 */
@Entity
@Table(name = "venue_claims")
public class VenueClaim {

	@Id
	private UUID id;

	@Column(name = "venue_id", nullable = false)
	private String venueId;

	@Column(name = "venue_name", nullable = false)
	private String venueName;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "proof", nullable = false)
	private String proof;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false)
	private ClaimStatus status;

	@Column(name = "reviewed_by")
	private UUID reviewedBy;

	@Column(name = "reviewed_at")
	private Instant reviewedAt;

	@Column(name = "reject_reason")
	private String rejectReason;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected VenueClaim() {
	}

	public VenueClaim(UUID userId, String venueId, String venueName, String proof) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.venueId = venueId;
		this.venueName = venueName;
		this.proof = proof;
		this.status = ClaimStatus.PENDING;
		this.createdAt = Instant.now();
	}

	public void approve(UUID adminId) {
		decide(ClaimStatus.APPROVED, adminId);
	}

	public void reject(UUID adminId, String reason) {
		decide(ClaimStatus.REJECTED, adminId);
		this.rejectReason = reason;
	}

	public void withdraw() {
		decide(ClaimStatus.WITHDRAWN, userId);
	}

	private void decide(ClaimStatus outcome, UUID decidedBy) {
		if (status != ClaimStatus.PENDING) {
			throw new ConflictException("This claim was already " + status.name().toLowerCase());
		}
		this.status = outcome;
		this.reviewedBy = decidedBy;
		this.reviewedAt = Instant.now();
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

	public String getProof() {
		return proof;
	}

	public ClaimStatus getStatus() {
		return status;
	}

	public UUID getReviewedBy() {
		return reviewedBy;
	}

	public Instant getReviewedAt() {
		return reviewedAt;
	}

	public String getRejectReason() {
		return rejectReason;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
