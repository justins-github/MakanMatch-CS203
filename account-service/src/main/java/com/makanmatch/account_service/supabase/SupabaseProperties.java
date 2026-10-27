package com.makanmatch.account_service.supabase;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;

/**
 * Connection details for the project's Supabase Auth.
 *
 * @param url            project URL, e.g. https://abcd.supabase.co
 * @param publishableKey public key for sign-in and refresh calls (legacy "anon" key also works)
 * @param secretKey      server-only key for admin calls (legacy "service_role" key also works)
 * @param jwtSecret      only for projects still on the legacy shared JWT secret; blank means
 *                       tokens are verified against the project's public signing keys (JWKS)
 */
@Validated
@ConfigurationProperties("supabase")
public record SupabaseProperties(
		@NotBlank String url,
		@NotBlank String publishableKey,
		@NotBlank String secretKey,
		String jwtSecret) {

	/** Base URL of the Auth REST API. */
	public String authUrl() {
		return url.replaceAll("/+$", "") + "/auth/v1";
	}

	/** The {@code iss} claim Supabase puts in every access token. */
	public String issuer() {
		return authUrl();
	}

	public String jwksUri() {
		return authUrl() + "/.well-known/jwks.json";
	}

	public boolean usesLegacyJwtSecret() {
		return jwtSecret != null && !jwtSecret.isBlank();
	}
}
