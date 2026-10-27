package com.makanmatch.account_service.auth;

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
import com.makanmatch.account_service.profile.DietaryNeeds;
import com.makanmatch.account_service.profile.DietaryNeeds.Restriction;
import com.makanmatch.account_service.profile.DietaryNeeds.SpiceLevel;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.supabase.SupabaseAuthClient;
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
}
