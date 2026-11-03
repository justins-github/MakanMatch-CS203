package com.makanmatch.account_service.security;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.oauth2.jwt.Jwt;

import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.ProfileService;

@ExtendWith(MockitoExtension.class)
class ProfileAuthenticationConverterTest {

	private static final UUID ID = UUID.fromString("55555555-5555-5555-5555-555555555555");

	@Mock
	ProfileService profiles;
	@Mock
	OwnershipService ownership;
	@Mock
	ActAsResolver actAs;

	@Test
	void aTokenFromADeletedAccountIsTurnedAwayNotA500() {
		// no auth.users row any more, so the profile can't be re-created
		given(profiles.loadOrCreate(eq(ID), any())).willThrow(new DataIntegrityViolationException("fk"));
		Jwt jwt = Jwt.withTokenValue("token").header("alg", "ES256").subject(ID.toString())
				.claim("email", "gone@example.com").issuedAt(Instant.EPOCH).expiresAt(Instant.EPOCH.plusSeconds(60))
				.build();

		assertThatThrownBy(() -> new ProfileAuthenticationConverter(profiles, ownership, actAs).convert(jwt))
				.isInstanceOf(BadCredentialsException.class)
				.hasMessageContaining("no longer exists");
	}
}
