package com.makanmatch.account_service.auth.dto;

import com.makanmatch.account_service.profile.dto.MeResponse;

/**
 * Returned by sign-up, login and refresh. The refresh token is NOT in the body:
 * it is set as an httpOnly cookie that page scripts can't read. The access token
 * should be kept in memory only (not localStorage) and sent as a Bearer header.
 */
public record SessionResponse(
		String accessToken,
		String tokenType,
		long expiresIn,
		long expiresAt,
		MeResponse me) {
}
