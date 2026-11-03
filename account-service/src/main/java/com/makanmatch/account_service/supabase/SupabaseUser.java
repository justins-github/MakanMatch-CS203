package com.makanmatch.account_service.supabase;

import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** A user record as returned by Supabase Auth (only the fields we use). */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SupabaseUser(
		UUID id,
		String email,
		@JsonProperty("user_metadata") Map<String, Object> userMetadata,
		@JsonProperty("banned_until") String bannedUntil,
		@JsonProperty("created_at") String createdAt,
		@JsonProperty("last_sign_in_at") String lastSignInAt) {

	/** The display name chosen at sign-up, if any. */
	public String displayName() {
		Object name = userMetadata == null ? null : userMetadata.get("display_name");
		return name instanceof String s && !s.isBlank() ? s : null;
	}
}
