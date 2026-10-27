package com.makanmatch.account_service.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.DietaryNeeds.Preference;
import com.makanmatch.account_service.profile.DietaryNeeds.Restriction;
import com.makanmatch.account_service.profile.DietaryNeeds.SpiceLevel;
import com.makanmatch.account_service.profile.dto.MeResponse;
import com.makanmatch.account_service.profile.dto.UpdateProfileRequest;
import com.makanmatch.account_service.supabase.SupabaseAuthClient;

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
}
