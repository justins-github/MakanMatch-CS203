package com.makanmatch.account_service.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;

class LoginRateLimiterTest {

	private final MutableClock clock = new MutableClock();
	private final LoginRateLimiter limiter = new LoginRateLimiter(3, Duration.ofMinutes(5), clock);

	@Test
	void blocksAfterTheLimitWithinTheWindow() {
		assertThat(limiter.tryAcquire("ip|a")).isTrue();
		assertThat(limiter.tryAcquire("ip|a")).isTrue();
		assertThat(limiter.tryAcquire("ip|a")).isTrue();
		assertThat(limiter.tryAcquire("ip|a")).isFalse();
	}

	@Test
	void keysAreCountedSeparately() {
		for (int i = 0; i < 3; i++) limiter.tryAcquire("ip|a");
		assertThat(limiter.tryAcquire("ip|b")).isTrue();
	}

	@Test
	void attemptsExpireAfterTheWindow() {
		for (int i = 0; i < 3; i++) limiter.tryAcquire("ip|a");
		clock.advance(Duration.ofMinutes(5).plusSeconds(1));
		assertThat(limiter.tryAcquire("ip|a")).isTrue();
	}

	private static final class MutableClock extends Clock {

		private Instant now = Instant.parse("2026-09-27T00:00:00Z");

		void advance(Duration by) {
			now = now.plus(by);
		}

		@Override
		public Instant instant() {
			return now;
		}

		@Override
		public ZoneId getZone() {
			return ZoneId.of("UTC");
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}
	}
}
