package com.makanmatch.account_service.profile;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/** What MakanMatch knows about an account beyond Supabase's email and password. */
@Entity
@Table(name = "profiles")
public class Profile {

	/** Same id as the Supabase Auth user. */
	@Id
	private UUID id;

	/** Optional login alias, lower-case (see {@link UsernameRules}). */
	@Column(name = "username")
	private String username;

	@Column(name = "display_name", nullable = false)
	private String displayName;

	@Column(name = "is_admin", nullable = false)
	private boolean admin;

	@Column(name = "disabled", nullable = false)
	private boolean disabled;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Profile() {
	}

	@PrePersist
	void onCreate() {
		createdAt = updatedAt = Instant.now();
	}

	@PreUpdate
	void onUpdate() {
		updatedAt = Instant.now();
	}

	public void rename(String displayName) {
		this.displayName = displayName;
	}

	public void changeUsername(String username) {
		this.username = username;
	}

	public void setAdmin(boolean admin) {
		this.admin = admin;
	}

	public void setDisabled(boolean disabled) {
		this.disabled = disabled;
	}

	public UUID getId() {
		return id;
	}

	public String getUsername() {
		return username;
	}

	public String getDisplayName() {
		return displayName;
	}

	public boolean isAdmin() {
		return admin;
	}

	public boolean isDisabled() {
		return disabled;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}
}
