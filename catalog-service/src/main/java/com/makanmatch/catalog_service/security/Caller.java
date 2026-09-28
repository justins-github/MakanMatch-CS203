package com.makanmatch.catalog_service.security;

import java.util.UUID;

import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Who is making a write request, with what they need to ask account-service
 * about their permissions on their behalf.
 *
 * @param actAs the X-Act-As header, if any (only honoured for admins, by account-service)
 */
public record Caller(UUID userId, String accessToken, String actAs) {

	public static Caller of(Jwt jwt, String actAs) {
		return new Caller(UUID.fromString(jwt.getSubject()), jwt.getTokenValue(), actAs);
	}
}
