package com.makanmatch.account_service.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Sliding-window limit on sign-in and sign-up attempts. Every login reaches
 * Supabase from this server's single address, so without our own per-client
 * limit one attacker could use up Supabase's per-address limit for everyone.
 * In-memory, so it resets on restart and isn't shared across instances.
 */
@Component
public class LoginRateLimiter {

	private static final int MAX_TRACKED_KEYS = 10_000;

	private final int maxAttempts;
	private final Duration window;
	private final Clock clock;
	private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

	@Autowired
	public LoginRateLimiter(@Value("${auth.login-attempts-per-window:10}") int maxAttempts,
			@Value("${auth.login-window:5m}") Duration window) {
		this(maxAttempts, window, Clock.systemUTC());
	}

	LoginRateLimiter(int maxAttempts, Duration window, Clock clock) {
		this.maxAttempts = maxAttempts;
		this.window = window;
		this.clock = clock;
	}

	/** Records an attempt for this key; false when the key is over its limit. */
	public boolean tryAcquire(String key) {
		if (attempts.size() > MAX_TRACKED_KEYS) attempts.clear();
		Instant now = clock.instant();
		Deque<Instant> recent = attempts.computeIfAbsent(key, k -> new ArrayDeque<>());
		synchronized (recent) {
			while (!recent.isEmpty() && !recent.peekFirst().isAfter(now.minus(window))) {
				recent.pollFirst();
			}
			if (recent.size() >= maxAttempts) return false;
			recent.addLast(now);
			return true;
		}
	}

	public Duration window() {
		return window;
	}
}
