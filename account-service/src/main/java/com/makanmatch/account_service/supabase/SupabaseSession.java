package com.makanmatch.account_service.supabase;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Tokens issued by Supabase Auth. The access token is a short-lived signed JWT;
 * the refresh token is long-lived and single-use (Supabase rotates it).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SupabaseSession(
		@JsonProperty("access_token") String accessToken,
		@JsonProperty("refresh_token") String refreshToken,
		@JsonProperty("expires_in") long expiresIn,
		@JsonProperty("expires_at") long expiresAt,
		SupabaseUser user) {
}
