package com.makanmatch.account_service.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.makanmatch.account_service.common.ConflictException;
import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.common.ForbiddenException;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.DietaryNeeds.Preference;
import com.makanmatch.account_service.profile.DietaryNeeds.Restriction;
import com.makanmatch.account_service.profile.DietaryNeeds.SpiceLevel;
import com.makanmatch.account_service.profile.dto.MeResponse;
import com.makanmatch.account_service.profile.dto.UpdateProfileRequest;
import com.makanmatch.account_service.supabase.SupabaseAuthClient;
import com.makanmatch.account_service.supabase.SupabaseAuthException;
import com.makanmatch.account_service.supabase.SupabaseSession;

@ExtendWith(MockitoExtension.class)
class ProfileServiceTest {

	private static final UUID ID = UUID.fromString("33333333-3333-3333-3333-333333333333");
	private static final String EMAIL = "mei@example.com";

	@Mock
	ProfileRepository repository;
	@Mock
	OwnershipService ownership;
	@Mock
	SupabaseAuthClient supabase;

	ProfileService service;
	Profile profile;

	@BeforeEach
	void setUp() {
		service = new ProfileService(repository, ownership, supabase);
		profile = new Profile() {
		};
		ReflectionTestUtils.setField(profile, "id", ID);
		ReflectionTestUtils.setField(profile, "displayName", "Mei");
		given(repository.findById(ID)).willReturn(Optional.of(profile));
	}

	@Test
	void signupStoresTheDietaryNeedsGiven() {
		service.createForSignup(ID, "Mei",
				new DietaryNeeds(Set.of(Restriction.VEGAN), Set.of(Preference.LESS_SWEET), SpiceLevel.NONE));

		assertThat(profile.getDietaryNeeds()).isEqualTo(
				new DietaryNeeds(Set.of(Restriction.VEGAN), Set.of(Preference.LESS_SWEET), SpiceLevel.NONE));
	}

	@Test
	void signupWithoutDietaryNeedsStartsWithNone() {
		service.createForSignup(ID, "Mei", null);

		assertThat(profile.getDietaryNeeds()).isEqualTo(new DietaryNeeds(Set.of(), Set.of(), null));
	}

	@Test
	void sendingDietaryNeedsReplacesAllOfThemIncludingTheSpiceLevel() {
		profile.changeDietaryNeeds(
				new DietaryNeeds(Set.of(Restriction.HALAL), Set.of(Preference.LOW_CARB), SpiceLevel.HOT));

		MeResponse me = service.update(ID, EMAIL, EffectiveRole.USER, new UpdateProfileRequest(null, null,
				new DietaryNeeds(Set.of(Restriction.VEGETARIAN, Restriction.NUT_ALLERGY), Set.of(), null)));

		assertThat(me.dietary()).isEqualTo(
				new DietaryNeeds(Set.of(Restriction.VEGETARIAN, Restriction.NUT_ALLERGY), Set.of(), null));
	}

	@Test
	void updatesWithoutDietaryNeedsLeaveThemAlone() {
		profile.changeDietaryNeeds(new DietaryNeeds(Set.of(Restriction.HALAL), Set.of(), SpiceLevel.MILD));

		MeResponse me = service.update(ID, EMAIL, EffectiveRole.USER, new UpdateProfileRequest("Mei Ling", null, null));

		assertThat(me.displayName()).isEqualTo("Mei Ling");
		assertThat(me.dietary()).isEqualTo(new DietaryNeeds(Set.of(Restriction.HALAL), Set.of(), SpiceLevel.MILD));
	}

	@Test
	void deletingRemovesTheLoginThenTheProfile() {
		given(supabase.signInWithPassword(EMAIL, "right-pass1")).willReturn(throwaway());

		service.delete(ID, EMAIL, "right-pass1");

		InOrder order = inOrder(repository, supabase);
		order.verify(supabase).deleteUser(ID);
		order.verify(repository).deleteById(ID);
		verify(supabase).signOut("check-token");
	}

	@Test
	void aWrongPasswordDeletesNothing() {
		given(supabase.signInWithPassword(EMAIL, "wrong")).willThrow(
				new SupabaseAuthException(400, "invalid_credentials", "Invalid login credentials"));

		assertThatThrownBy(() -> service.delete(ID, EMAIL, "wrong")).isInstanceOf(ForbiddenException.class);

		verify(repository, never()).deleteById(any());
		verify(supabase, never()).deleteUser(any());
	}

	@Test
	void theLastActiveAdminCantDeleteTheirAccount() {
		ReflectionTestUtils.setField(profile, "admin", true);
		given(repository.countByAdminTrueAndDisabledFalse()).willReturn(1L);

		assertThatThrownBy(() -> service.checkCanDelete(ID, EMAIL, "right-pass1"))
				.isInstanceOf(ConflictException.class)
				.hasMessageContaining("only admin");

		verify(supabase, never()).signInWithPassword(any(), any());
	}

	@Test
	void anAdminCanGoWhenAnotherAdminRemains() {
		ReflectionTestUtils.setField(profile, "admin", true);
		given(repository.countByAdminTrueAndDisabledFalse()).willReturn(2L);
		given(supabase.signInWithPassword(EMAIL, "right-pass1")).willReturn(throwaway());

		service.delete(ID, EMAIL, "right-pass1");

		verify(supabase).deleteUser(ID);
	}

	@Test
	void aLoginAlreadyGoneFromSupabaseStillCountsAsDeleted() {
		given(supabase.signInWithPassword(EMAIL, "right-pass1")).willReturn(throwaway());
		willThrow(new SupabaseAuthException(404, "user_not_found", "User not found")).given(supabase).deleteUser(ID);

		service.delete(ID, EMAIL, "right-pass1");

		verify(repository).deleteById(ID);
	}

	@Test
	void supabaseFailingToDeleteTheLoginLeavesTheProfile() {
		given(supabase.signInWithPassword(EMAIL, "right-pass1")).willReturn(throwaway());
		willThrow(new SupabaseAuthException(503, "unreachable", "Supabase Auth is unreachable"))
				.given(supabase).deleteUser(ID);

		assertThatThrownBy(() -> service.delete(ID, EMAIL, "right-pass1")).isInstanceOf(SupabaseAuthException.class);

		verify(repository, never()).deleteById(any());
	}

	private static SupabaseSession throwaway() {
		return new SupabaseSession("check-token", "check-refresh", 3600, 0, null);
	}
}
