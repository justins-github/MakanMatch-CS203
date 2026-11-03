package com.makanmatch.account_service.kaki;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Two people and whether they are kakis yet. There is at most one link per pair,
 * whichever of them asked (unique index in V5__create_kakis.sql).
 */
@Entity
@Table(name = "kaki_links")
public class KakiLink {

	@Id
	private UUID id;

	@Column(name = "requester_id", nullable = false)
	private UUID requesterId;

	@Column(name = "addressee_id", nullable = false)
	private UUID addresseeId;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false)
	private KakiStatus status;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "accepted_at")
	private Instant acceptedAt;

	protected KakiLink() {
	}

	public KakiLink(UUID requesterId, UUID addresseeId) {
		this.id = UUID.randomUUID();
		this.requesterId = requesterId;
		this.addresseeId = addresseeId;
		this.status = KakiStatus.PENDING;
		this.createdAt = Instant.now();
	}

	public void accept() {
		this.status = KakiStatus.ACCEPTED;
		this.acceptedAt = Instant.now();
	}

	public boolean isAccepted() {
		return status == KakiStatus.ACCEPTED;
	}

	/** The person on the other side of the link from {@code userId}. */
	public UUID otherThan(UUID userId) {
		return requesterId.equals(userId) ? addresseeId : requesterId;
	}

	/** When they became kakis, or when the request was made if it is still pending. */
	public Instant since() {
		return isAccepted() ? acceptedAt : createdAt;
	}

	public UUID getId() {
		return id;
	}

	public UUID getRequesterId() {
		return requesterId;
	}

	public UUID getAddresseeId() {
		return addresseeId;
	}

	public KakiStatus getStatus() {
		return status;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getAcceptedAt() {
		return acceptedAt;
	}
}
