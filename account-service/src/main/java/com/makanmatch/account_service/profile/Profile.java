package com.makanmatch.account_service.profile;

import java.time.Instant;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.makanmatch.account_service.profile.DietaryNeeds.Preference;
import com.makanmatch.account_service.profile.DietaryNeeds.Restriction;
import com.makanmatch.account_service.profile.DietaryNeeds.SpiceLevel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

	@Enumerated(EnumType.STRING)
	@JdbcTypeCode(SqlTypes.ARRAY)
	@Column(name = "dietary_restrictions", nullable = false)
	private Restriction[] dietaryRestrictions = {};

	@Enumerated(EnumType.STRING)
	@JdbcTypeCode(SqlTypes.ARRAY)
	@Column(name = "dietary_preferences", nullable = false)
	private Preference[] dietaryPreferences = {};

	@Enumerated(EnumType.STRING)
	@Column(name = "spice_level")
	private SpiceLevel spiceLevel;

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

	public void changeDietaryNeeds(DietaryNeeds needs) {
		this.dietaryRestrictions = needs.restrictions().toArray(Restriction[]::new);
		this.dietaryPreferences = needs.preferences().toArray(Preference[]::new);
		this.spiceLevel = needs.spiceLevel();
	}

	public DietaryNeeds getDietaryNeeds() {
		return new DietaryNeeds(Set.copyOf(Arrays.asList(dietaryRestrictions)),
				Set.copyOf(Arrays.asList(dietaryPreferences)), spiceLevel);
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
