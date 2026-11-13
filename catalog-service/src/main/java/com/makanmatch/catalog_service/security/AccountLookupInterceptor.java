package com.makanmatch.catalog_service.security;

import java.util.Set;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Asks account-service who the caller is before a write reaches its service.
 * Every write runs in a database transaction, this service may hold only three
 * connections, and account-service can take 13 s or more to answer while it
 * starts. Waiting here, before any transaction opens, holds no connection: the
 * lookup the service makes inside its transaction is then answered from
 * {@link AccountClient}'s cache. What the answer allows is still the service's
 * decision; only an account-service that can't be reached stops the request here.
 */
public class AccountLookupInterceptor implements HandlerInterceptor {

	private static final String ACT_AS = "X-Act-As";
	/** Every write that checks the caller's access. DELETE (forget my contributions) doesn't. */
	private static final Set<String> WRITES = Set.of("POST", "PUT", "PATCH");

	private final AccountClient accounts;

	public AccountLookupInterceptor(AccountClient accounts) {
		this.accounts = accounts;
	}

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		if (WRITES.contains(request.getMethod())
				&& SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken token) {
			accounts.me(Caller.of(token.getToken(), request.getHeader(ACT_AS)));
		}
		return true;
	}
}
