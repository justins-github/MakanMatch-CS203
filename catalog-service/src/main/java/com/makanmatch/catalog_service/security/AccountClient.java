package com.makanmatch.catalog_service.security;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

	private static final Logger log = LoggerFactory.getLogger(AccountClient.class);

	private final RestClient http;
	private final Clock clock;
	private final String target;
	private final Map<String, Cached> cache = new ConcurrentHashMap<>();

	public AccountClient(@Value("${account-service.url}") String accountServiceUrl,
			@Value("${account-service.ca-bundle:}") String caBundle) {
		// HTTP/1.1, as the engine speaks to the same service: left alone, this client asks
		// every plain-HTTP server to switch to HTTP/2 first.
		HttpClient.Builder client = HttpClient.newBuilder()
				.version(HttpClient.Version.HTTP_1_1).connectTimeout(COLD_START_WAIT);
		// On Vercel the address is HTTPS behind Vercel's own certificate authority.
		PlatformCertificates.trusting(caBundle).ifPresent(client::sslContext);
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client.build());
		factory.setReadTimeout(COLD_START_WAIT);
		this.http = RestClient.builder().baseUrl(accountServiceUrl).requestFactory(factory).build();
		this.clock = Clock.systemUTC();
		this.target = schemeAndHost(accountServiceUrl);
		log.info("account-service: {}", target);
	}

	/** Where calls go, for the log: no path or query, in case the address carries a secret. */
	private static String schemeAndHost(String url) {
		try {
			URI uri = URI.create(url);
			return uri.getScheme() + "://" + uri.getHost() + (uri.getPort() < 0 ? "" : ":" + uri.getPort());
		}
		catch (IllegalArgumentException e) {
			return "(an address that isn't a URL)";
		}
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
							log.warn("account-service at {} answered {}", target, status);
							throw new UpstreamUnavailableException("Account service answered " + status);
						}
						return Optional.ofNullable(response.bodyTo(Me.class));
					});
		}
		catch (ResourceAccessException e) {
			// The caller only sees "unreachable"; the reason (refused, timed out, TLS,
			// unknown host) is here.
			log.warn("account-service at {} could not be reached", target, e);
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
