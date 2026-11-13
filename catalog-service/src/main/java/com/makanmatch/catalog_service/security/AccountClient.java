package com.makanmatch.catalog_service.security;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.makanmatch.catalog_service.common.UpstreamUnavailableException;

/**
 * Asks account-service who the caller is, forwarding their own token. Account
 * data stays owned by account-service; this service never reads its tables.
 * Answers are cached briefly so a burst of writes costs one lookup.
 */
@Component
public class AccountClient {

	private static final Duration CACHE_FOR = Duration.ofSeconds(30);
	private static final int MAX_CACHED = 1_000;

	// How long to wait for an answer. On Vercel an idle account-service is stopped and
	// takes about 13 s to start again, so a shorter wait turns every cold start into a
	// 503. Matches the engine's wait (demo/server/clients/accountClient.js).
	private static final Duration COLD_START_WAIT = Duration.ofSeconds(25);

	private final RestClient http;
	private final Clock clock;
	private final Map<String, Cached> cache = new ConcurrentHashMap<>();

	public AccountClient(@Value("${account-service.url}") String accountServiceUrl) {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(COLD_START_WAIT).build());
		factory.setReadTimeout(COLD_START_WAIT);
		this.http = RestClient.builder().baseUrl(accountServiceUrl).requestFactory(factory).build();
		this.clock = Clock.systemUTC();
	}

	/** The caller's account as account-service sees it; empty when it rejects the token. */
	public Optional<Me> me(Caller caller) {
		String key = caller.accessToken() + "|" + (caller.actAs() == null ? "" : caller.actAs());
		Instant now = clock.instant();
		Cached hit = cache.get(key);
		if (hit != null && hit.until().isAfter(now)) return hit.me();

		Optional<Me> me = fetch(caller);
		if (cache.size() > MAX_CACHED) cache.clear();
		cache.put(key, new Cached(me, now.plus(CACHE_FOR)));
		return me;
	}

	private Optional<Me> fetch(Caller caller) {
		try {
			return http.get().uri("/api/me")
					.headers(headers -> {
						headers.setBearerAuth(caller.accessToken());
						if (caller.actAs() != null) headers.set("X-Act-As", caller.actAs());
					})
					.exchange((request, response) -> {
						int status = response.getStatusCode().value();
						if (status == 401 || status == 403) return Optional.<Me>empty();
						if (response.getStatusCode().isError()) {
							throw new UpstreamUnavailableException("Account service answered " + status);
						}
						return Optional.ofNullable(response.bodyTo(Me.class));
					});
		}
		catch (ResourceAccessException e) {
			throw new UpstreamUnavailableException("Account service is unreachable");
		}
	}

	/** The subset of account-service's MeResponse this service needs. */
	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Me(String id, String effectiveRole, List<OwnedVenue> ownedVenues) {

		public boolean managesVenues() {
			return "OWNER".equals(effectiveRole) || "ADMIN".equals(effectiveRole);
		}

		public boolean owns(String venueId) {
			return ownedVenues != null && ownedVenues.stream().anyMatch(v -> venueId.equals(v.venueId()));
		}
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record OwnedVenue(String venueId, String venueName) {
	}

	private record Cached(Optional<Me> me, Instant until) {
	}
}
