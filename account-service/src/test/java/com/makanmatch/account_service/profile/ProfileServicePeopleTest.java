package com.makanmatch.account_service.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.BDDMockito.given;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.makanmatch.account_service.common.BadRequestException;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.dto.PersonCard;
import com.makanmatch.account_service.supabase.SupabaseAuthClient;

@ExtendWith(MockitoExtension.class)
class ProfileServicePeopleTest {

	private static final UUID HAFIZ = UUID.fromString("22222222-2222-2222-2222-222222222222");
	private static final UUID NADIA = UUID.fromString("33333333-3333-3333-3333-333333333333");
	private static final UUID NOBODY = UUID.fromString("44444444-4444-4444-4444-444444444444");

	@Mock
	ProfileRepository repository;
	@Mock
	OwnershipService ownership;
	@Mock
	SupabaseAuthClient supabase;

	ProfileService service;

	@BeforeEach
	void setUp() {
		service = new ProfileService(repository, ownership, supabase);
	}

	private static Profile profile(UUID id, String displayName, String username) {
		Profile profile = new Profile() {
		};
		ReflectionTestUtils.setField(profile, "id", id);
		ReflectionTestUtils.setField(profile, "displayName", displayName);
		ReflectionTestUtils.setField(profile, "username", username);
		return profile;
	}

	private void stored(Profile... profiles) {
		given(repository.findAllById(anyCollection())).willReturn(List.of(profiles));
	}

	@Test
	void givesPeopleInTheOrderAsked() {
		stored(profile(NADIA, "Nadia", "nadia_mild"),
				profile(HAFIZ, "Hafiz", "hafiz_nospice"));

		assertThat(service.people(HAFIZ + "," + NADIA)).containsExactly(
				new PersonCard(HAFIZ, "Hafiz", "hafiz_nospice"),
				new PersonCard(NADIA, "Nadia", "nadia_mild"));
	}

	@Test
	void leavesOutPeopleWhoDoNotExist() {
		stored(profile(HAFIZ, "Hafiz", "hafiz_nospice"));

		assertThat(service.people(NOBODY + "," + HAFIZ)).containsExactly(new PersonCard(HAFIZ, "Hafiz", "hafiz_nospice"));
	}

	@Test
	void leavesOutDisabledAccounts() {
		Profile disabled = profile(NADIA, "Nadia", "nadia_mild");
		disabled.setDisabled(true);
		stored(profile(HAFIZ, "Hafiz", "hafiz_nospice"), disabled);

		assertThat(service.people(HAFIZ + "," + NADIA)).containsExactly(new PersonCard(HAFIZ, "Hafiz", "hafiz_nospice"));
	}

	@Test
	void someoneWithNoUsernameStillComesBack() {
		stored(profile(HAFIZ, "Hafiz", null));

		assertThat(service.people(HAFIZ.toString())).containsExactly(new PersonCard(HAFIZ, "Hafiz", null));
	}

	@Test
	void asksForEachPersonOnce() {
		stored(profile(HAFIZ, "Hafiz", "hafiz_nospice"));

		assertThat(service.people(HAFIZ + "," + HAFIZ)).hasSize(1);
	}

	@Test
	void fiftyPeopleIsFine() {
		stored();

		assertThat(service.people(ids(50))).isEmpty();
	}

	@Test
	void moreThanFiftyIsABadRequest() {
		assertThatThrownBy(() -> service.people(ids(51))).isInstanceOf(BadRequestException.class);
	}

	@Test
	void aMalformedIdIsABadRequest() {
		assertThatThrownBy(() -> service.people("not-an-id")).isInstanceOf(BadRequestException.class);
	}

	private static String ids(int count) {
		return IntStream.range(0, count).mapToObj(i -> UUID.nameUUIDFromBytes(new byte[] { (byte) i }).toString())
				.collect(Collectors.joining(","));
	}
}
