package com.makanmatch.account_service.kaki;

import java.time.Instant;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

/**
 * A saved group like "Thursday lunch crew": a private shortcut for picking the
 * same kakis again. The owner is always in it and is not listed as a member.
 */
@Entity
@Table(name = "kaki_groups")
public class KakiGroup {

	@Id
	private UUID id;

	@Column(name = "owner_id", nullable = false)
	private UUID ownerId;

	@Column(name = "name", nullable = false)
	private String name;

	@ElementCollection
	@CollectionTable(name = "kaki_group_members", joinColumns = @JoinColumn(name = "group_id"))
	@Column(name = "user_id", nullable = false)
	private Set<UUID> memberIds = new HashSet<>();

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected KakiGroup() {
	}

	public KakiGroup(UUID ownerId, String name, Collection<UUID> memberIds) {
		this.id = UUID.randomUUID();
		this.ownerId = ownerId;
		this.name = name;
		this.memberIds.addAll(memberIds);
		this.createdAt = Instant.now();
	}

	/** Replaces the name and the whole member list. */
	public void update(String name, Collection<UUID> memberIds) {
		this.name = name;
		this.memberIds.clear();
		this.memberIds.addAll(memberIds);
	}

	public void removeMember(UUID memberId) {
		memberIds.remove(memberId);
	}

	public UUID getId() {
		return id;
	}

	public UUID getOwnerId() {
		return ownerId;
	}

	public String getName() {
		return name;
	}

	public Set<UUID> getMemberIds() {
		return Collections.unmodifiableSet(memberIds);
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
