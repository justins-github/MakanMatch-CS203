package com.makanmatch.account_service.auth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.account_service.auth.dto.SignupRequest;
import com.makanmatch.account_service.common.BadRequestException;
import com.makanmatch.account_service.common.UnauthorizedException;
import com.makanmatch.account_service.profile.DietaryNeeds;
import com.makanmatch.account_service.profile.DietaryNeeds.Restriction;
import com.makanmatch.account_service.profile.DietaryNeeds.SpiceLevel;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.supabase.SupabaseAuthClient;
import com.makanmatch.account_service.supabase.SupabaseAuthException;
import com.makanmatch.account_service.supabase.SupabaseSession;
import com.makanmatch.account_service.supabase.SupabaseUser;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

	private static final UUID ID = UUID.fromString("44444444-4444-4444-4444-444444444444");

	@Mock
	SupabaseAuthClient supabase;
	@Mock
	ProfileService profiles;

	@Test
	void signupSavesTheDietaryNeedsOnTheNewProfile() {
		DietaryNeeds needs = new DietaryNeeds(Set.of(Restriction.HALAL), Set.of(), SpiceLevel.MEDIUM);
		SupabaseUser user = new SupabaseUser(ID, "mei@example.com", Map.of(), null, null, null);
		given(supabase.createUser("mei@example.com", "hunter22x", "Mei")).willReturn(user);
		given(supabase.signInWithPassword("mei@example.com", "hunter22x"))
				.willReturn(new SupabaseSession("access", "refresh", 3600, 1_900_000_000L, user));

		new AuthService(supabase, profiles).signup(new SignupRequest("Mei@Example.com", "hunter22x", "Mei", needs));

		verify(profiles).createForSignup(ID, "Mei", needs);
	}

	// The controller clears the refresh cookie on UnauthorizedException, which signs
	// the person out. Supabase being busy says nothing about their session.
	@Test
	void aRateLimitedRefreshDoesNotEndTheSession() {
		given(supabase.refresh("refresh-1"))
				.willThrow(new SupabaseAuthException(429, "over_request_rate_limit", "Request rate limit reached"));

		assertThatThrownBy(() -> new AuthService(supabase, profiles).refresh("refresh-1"))
				.isInstanceOf(BadRequestException.class)
				.hasMessageContaining("try again");
	}

	@Test
	void aRefreshTokenSupabaseRejectsEndsTheSession() {
		given(supabase.refresh("refresh-1"))
				.willThrow(new SupabaseAuthException(400, "refresh_token_not_found", "Invalid Refresh Token"));

		assertThatThrownBy(() -> new AuthService(supabase, profiles).refresh("refresh-1"))
				.isInstanceOf(UnauthorizedException.class);
	}
}
