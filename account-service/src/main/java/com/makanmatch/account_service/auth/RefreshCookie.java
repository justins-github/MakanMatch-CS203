package com.makanmatch.account_service.auth;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * The refresh token lives only in this cookie:
 * - HttpOnly: page scripts (including injected ones) can't read it;
 * - SameSite=Strict: other sites can't make the browser send it;
 * - Path=/api/auth: it isn't sent with any other request;
 * - Secure: https only (switched off for plain-http localhost).
 */
@Component
public class RefreshCookie {

	public static final String NAME = "mm_refresh";

	private static final String PATH = "/api/auth";
	private static final Duration MAX_AGE = Duration.ofDays(30);

	private final boolean secure;

	public RefreshCookie(@Value("${auth.cookie-secure:false}") boolean secure) {
		this.secure = secure;
	}

	public ResponseCookie issue(String refreshToken) {
		return base(refreshToken).maxAge(MAX_AGE).build();
	}

	public ResponseCookie clear() {
		return base("").maxAge(Duration.ZERO).build();
	}

	private ResponseCookie.ResponseCookieBuilder base(String value) {
		return ResponseCookie.from(NAME, value).httpOnly(true).secure(secure).sameSite("Strict").path(PATH);
	}
}
