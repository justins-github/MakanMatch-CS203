package com.makanmatch.account_service.kaki;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
import com.makanmatch.account_service.common.ConflictException;
import com.makanmatch.account_service.common.ForbiddenException;
import com.makanmatch.account_service.common.NotFoundException;
import com.makanmatch.account_service.kaki.dto.GroupResponse;
import com.makanmatch.account_service.kaki.dto.Kaki;
import com.makanmatch.account_service.kaki.dto.KakisResponse;
import com.makanmatch.account_service.kaki.dto.PartyMember;
import com.makanmatch.account_service.kaki.dto.SaveGroupRequest;
import com.makanmatch.account_service.profile.DietaryNeeds;
import com.makanmatch.account_service.profile.DietaryNeeds.Restriction;
import com.makanmatch.account_service.profile.Profile;
import com.makanmatch.account_service.profile.ProfileService;

/**
 * The repositories are backed by in-memory lists, so each test reads as a
 * story: who asked whom, who accepted, what each person then sees.
 */
@ExtendWith(MockitoExtension.class)
class KakiServiceTest {

	private static final UUID MEI = UUID.fromString("00000000-0000-0000-0000-000000000001");
	private static final UUID JIAHUI = UUID.fromString("00000000-0000-0000-0000-000000000002");
	private static final UUID ARJUN = UUID.fromString("00000000-0000-0000-0000-000000000003");
	private static final UUID SIEW = UUID.fromString("00000000-0000-0000-0000-000000000004");

	@Mock
	KakiLinkRepository links;
	@Mock
	KakiGroupRepository groups;
	@Mock
	ProfileService profiles;

	KakiService service;

	final Map<UUID, Profile> people = new HashMap<>();
	final List<KakiLink> storedLinks = new ArrayList<>();
	final List<KakiGroup> storedGroups = new ArrayList<>();

	@BeforeEach
	void setUp() {
		service = new KakiService(links, groups, profiles);
		people.put(MEI, person(MEI, "Mei", "mei"));
		people.put(JIAHUI, person(JIAHUI, "Jia Hui", "jiahui"));
		people.put(ARJUN, person(ARJUN, "Arjun", "arjun", Restriction.NUT_ALLERGY, Restriction.HALAL));
		people.put(SIEW, person(SIEW, "siew", null));

		lenient().when(profiles.findAll(any())).thenAnswer(call -> {
			Collection<UUID> ids = call.getArgument(0);
			return ids.stream().filter(people::containsKey).collect(Collectors.toMap(id -> id, people::get));
		});
		// Exact match: the service has to lower-case and strip the @ itself.
		lenient().when(profiles.findIdByUsername(any())).thenAnswer(call -> people.values().stream()
				.filter(who -> call.getArgument(0).equals(who.getUsername())).map(Profile::getId).findFirst());

		lenient().when(links.findInvolving(any())).thenAnswer(call -> {
			UUID who = call.getArgument(0);
			return storedLinks.stream()
					.filter(link -> link.getRequesterId().equals(who) || link.getAddresseeId().equals(who)).toList();
		});
		lenient().when(links.findBetween(any(), any())).thenAnswer(call -> {
			Set<UUID> pair = Set.of(call.<UUID>getArgument(0), call.<UUID>getArgument(1));
			return storedLinks.stream()
					.filter(link -> pair.equals(Set.of(link.getRequesterId(), link.getAddresseeId()))).findFirst();
		});
		lenient().when(links.saveAndFlush(any())).thenAnswer(call -> {
			storedLinks.add(call.getArgument(0));
			return call.getArgument(0);
		});
		lenient().doAnswer(call -> storedLinks.remove(call.<KakiLink>getArgument(0))).when(links).delete(any());

		lenient().when(groups.findByOwnerId(any())).thenAnswer(call -> storedGroups.stream()
				.filter(group -> group.getOwnerId().equals(call.getArgument(0))).toList());
		lenient().when(groups.findByIdAndOwnerId(any(), any())).thenAnswer(call -> storedGroups.stream()
				.filter(group -> group.getId().equals(call.getArgument(0))
						&& group.getOwnerId().equals(call.getArgument(1)))
				.findFirst());
		lenient().when(groups.findByOwnerIdAndMember(any(), any())).thenAnswer(call -> storedGroups.stream()
				.filter(group -> group.getOwnerId().equals(call.getArgument(0))
						&& group.getMemberIds().contains(call.<UUID>getArgument(1)))
				.toList());
		lenient().when(groups.save(any())).thenAnswer(call -> {
			storedGroups.add(call.getArgument(0));
			return call.getArgument(0);
		});
		lenient().doAnswer(call -> storedGroups.remove(call.<KakiGroup>getArgument(0))).when(groups).delete(any());
	}

	// --- requests ---

	@Test
	void usernamesMatchWhateverTheCaseAndWithOrWithoutTheAt() {
		KakiService.Added added = service.request(MEI, "  @JiaHui ");

		assertThat(added.acceptedTheirs()).isFalse();
		assertThat(added.kakis().outgoing()).extracting(Kaki::id, Kaki::username).containsExactly(
				tuple(JIAHUI, "jiahui"));
		assertThat(storedLinks).singleElement().satisfies(link -> {
			assertThat(link.getRequesterId()).isEqualTo(MEI);
			assertThat(link.getStatus()).isEqualTo(KakiStatus.PENDING);
		});
	}

	@Test
	void youCannotAddYourself() {
		assertThatThrownBy(() -> service.request(MEI, "@MEI")).isInstanceOf(BadRequestException.class);
		verify(links, never()).saveAndFlush(any());
	}

	@Test
	void aBlankUsernameIsRejected() {
		assertThatThrownBy(() -> service.request(MEI, " @ ")).isInstanceOf(BadRequestException.class);
	}

	@Test
	void anUnknownUsernameIsNotFound() {
		assertThatThrownBy(() -> service.request(MEI, "nobody")).isInstanceOf(NotFoundException.class);
	}

	@Test
	void askingTwiceIsAConflict() {
		service.request(MEI, "jiahui");
		assertThatThrownBy(() -> service.request(MEI, "jiahui")).isInstanceOf(ConflictException.class);
		assertThat(storedLinks).hasSize(1);
	}

	@Test
	void askingAnExistingKakiIsAConflictWhoeverAskedFirst() {
		befriend(JIAHUI, MEI);
		assertThatThrownBy(() -> service.request(MEI, "jiahui")).isInstanceOf(ConflictException.class);
		assertThatThrownBy(() -> service.request(JIAHUI, "mei")).isInstanceOf(ConflictException.class);
	}

	@Test
	void askingSomeoneWhoAlreadyAskedYouAcceptsTheirRequest() {
		service.request(JIAHUI, "mei");

		KakiService.Added added = service.request(MEI, "jiahui");

		assertThat(added.acceptedTheirs()).isTrue();
		assertThat(added.kakis().kakis()).extracting(Kaki::id).containsExactly(JIAHUI);
		assertThat(added.kakis().incoming()).isEmpty();
		assertThat(storedLinks).singleElement().satisfies(link -> assertThat(link.isAccepted()).isTrue());
	}

	@Test
	void onlyThePersonAskedCanAccept() {
		asked(JIAHUI, MEI);

		assertThatThrownBy(() -> service.accept(JIAHUI, MEI)).isInstanceOf(NotFoundException.class);
		assertThatThrownBy(() -> service.accept(MEI, ARJUN)).isInstanceOf(NotFoundException.class);

		KakisResponse mine = service.accept(MEI, JIAHUI);
		assertThat(mine.kakis()).singleElement().satisfies(kaki -> {
			assertThat(kaki.id()).isEqualTo(JIAHUI);
			assertThat(kaki.since()).isEqualTo(storedLinks.get(0).getAcceptedAt());
		});
		// Already accepted: there is no pending request left to accept.
		assertThatThrownBy(() -> service.accept(MEI, JIAHUI)).isInstanceOf(NotFoundException.class);
	}

	@Test
	void eachListComesOutOldestFirst() {
		KakiLink later = asked(MEI, JIAHUI);
		KakiLink earlier = asked(MEI, SIEW);
		ReflectionTestUtils.setField(later, "createdAt", Instant.parse("2026-10-02T00:00:00Z"));
		ReflectionTestUtils.setField(earlier, "createdAt", Instant.parse("2026-10-01T00:00:00Z"));
		asked(ARJUN, MEI);

		KakisResponse mine = service.kakis(MEI);

		assertThat(mine.outgoing()).extracting(Kaki::id).containsExactly(SIEW, JIAHUI);
		assertThat(mine.incoming()).extracting(Kaki::id).containsExactly(ARJUN);
		assertThat(mine.kakis()).isEmpty();
		assertThat(service.kakis(ARJUN).outgoing()).extracting(Kaki::displayName).containsExactly("Mei");
	}

	// --- delete ---

	@Test
	void declineCancelAndRemoveAllDeleteTheLink() {
		asked(JIAHUI, MEI);
		asked(MEI, ARJUN);
		befriend(MEI, SIEW);

		assertThat(service.delete(MEI, JIAHUI).incoming()).isEmpty(); // decline
		assertThat(service.delete(MEI, ARJUN).outgoing()).isEmpty(); // cancel
		assertThat(service.delete(SIEW, MEI).kakis()).isEmpty(); // remove, from either side
		assertThat(storedLinks).isEmpty();
	}

	@Test
	void deletingWithNoLinkIsNotFound() {
		assertThatThrownBy(() -> service.delete(MEI, JIAHUI)).isInstanceOf(NotFoundException.class);
	}

	@Test
	void removingAKakiTakesEachOutOfTheOthersGroups() {
		befriend(MEI, JIAHUI);
		befriend(MEI, ARJUN);
		KakiGroup lunch = group(MEI, "Lunch", JIAHUI, ARJUN);
		KakiGroup duo = group(MEI, "Duo", JIAHUI);
		KakiGroup dinner = group(JIAHUI, "Dinner", MEI, ARJUN);
		KakiGroup arjuns = group(ARJUN, "Arjun's", JIAHUI);

		service.delete(MEI, JIAHUI);

		assertThat(lunch.getMemberIds()).containsExactly(ARJUN);
		assertThat(dinner.getMemberIds()).containsExactly(ARJUN);
		// A group left with nobody in it is gone, since a group has 1-9 kakis.
		assertThat(storedGroups).doesNotContain(duo);
		// Other people's groups are none of this link's business.
		assertThat(arjuns.getMemberIds()).containsExactly(JIAHUI);
	}

	// --- groups ---

	@Test
	void groupNamesAreTrimmedAndListedByNameWithMembersByName() {
		befriend(MEI, JIAHUI);
		befriend(MEI, ARJUN);
		befriend(SIEW, MEI);

		service.createGroup(MEI, new SaveGroupRequest("  zebra crossing  ", List.of(JIAHUI)));
		List<GroupResponse> mine = service.createGroup(MEI,
				new SaveGroupRequest("Thursday lunch crew", List.of(SIEW, JIAHUI, ARJUN, JIAHUI)));

		assertThat(mine).extracting(GroupResponse::name).containsExactly("Thursday lunch crew", "zebra crossing");
		assertThat(mine.get(0).members()).extracting(Kaki::displayName).containsExactly("Arjun", "Jia Hui", "siew");
		assertThat(mine.get(0).members()).allSatisfy(kaki -> assertThat(kaki.since()).isNotNull());
	}

	@Test
	void groupNamesMustBe1To40Characters() {
		befriend(MEI, JIAHUI);
		List<UUID> members = List.of(JIAHUI);

		assertThatThrownBy(() -> service.createGroup(MEI, new SaveGroupRequest("   ", members)))
				.isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> service.createGroup(MEI, new SaveGroupRequest(null, members)))
				.isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> service.createGroup(MEI, new SaveGroupRequest("x".repeat(41), members)))
				.isInstanceOf(BadRequestException.class);
		assertThat(service.createGroup(MEI, new SaveGroupRequest("x".repeat(40), members))).hasSize(1);
	}

	@Test
	void aGroupHas1To9Kakis() {
		List<UUID> nine = IntStream.range(0, 9).mapToObj(i -> UUID.randomUUID()).toList();
		nine.forEach(id -> befriend(MEI, id));
		List<UUID> ten = new ArrayList<>(nine);
		ten.add(JIAHUI);
		befriend(MEI, JIAHUI);

		assertThatThrownBy(() -> service.createGroup(MEI, new SaveGroupRequest("Empty", List.of())))
				.isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> service.createGroup(MEI, new SaveGroupRequest("Empty", null)))
				.isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> service.createGroup(MEI, new SaveGroupRequest("Ten", ten)))
				.isInstanceOf(BadRequestException.class);
		assertThat(service.createGroup(MEI, new SaveGroupRequest("Nine", nine)).get(0).members()).hasSize(9);
	}

	@Test
	void onlyAcceptedKakisCanBeInAGroup() {
		befriend(MEI, JIAHUI);
		asked(MEI, ARJUN);

		assertThatThrownBy(() -> service.createGroup(MEI, new SaveGroupRequest("Pending", List.of(JIAHUI, ARJUN))))
				.isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> service.createGroup(MEI, new SaveGroupRequest("Stranger", List.of(SIEW))))
				.isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> service.createGroup(MEI, new SaveGroupRequest("Me", List.of(MEI))))
				.isInstanceOf(BadRequestException.class);
		assertThat(storedGroups).isEmpty();
	}

	@Test
	void ownersCanRenameRefillAndDeleteTheirGroups() {
		befriend(MEI, JIAHUI);
		befriend(MEI, ARJUN);
		KakiGroup lunch = group(MEI, "Lunch", JIAHUI);

		List<GroupResponse> renamed = service.updateGroup(MEI, lunch.getId(),
				new SaveGroupRequest("Supper", List.of(ARJUN)));
		assertThat(renamed).singleElement().satisfies(group -> {
			assertThat(group.name()).isEqualTo("Supper");
			assertThat(group.members()).extracting(Kaki::id).containsExactly(ARJUN);
		});

		assertThat(service.deleteGroup(MEI, lunch.getId())).isEmpty();
	}

	@Test
	void someoneElsesGroupLooksMissing() {
		befriend(JIAHUI, MEI);
		KakiGroup theirs = group(JIAHUI, "Jia Hui's", MEI);
		SaveGroupRequest edit = new SaveGroupRequest("Mine now", List.of(JIAHUI));

		assertThatThrownBy(() -> service.updateGroup(MEI, theirs.getId(), edit)).isInstanceOf(NotFoundException.class);
		assertThatThrownBy(() -> service.deleteGroup(MEI, theirs.getId())).isInstanceOf(NotFoundException.class);
		assertThat(service.groups(MEI)).isEmpty();
		assertThat(theirs.getName()).isEqualTo("Jia Hui's");
	}

	@Test
	void editingAGroupChecksTheSameRules() {
		befriend(MEI, JIAHUI);
		KakiGroup lunch = group(MEI, "Lunch", JIAHUI);

		assertThatThrownBy(() -> service.updateGroup(MEI, lunch.getId(), new SaveGroupRequest("Lunch", List.of(SIEW))))
				.isInstanceOf(BadRequestException.class);
		assertThat(lunch.getMemberIds()).containsExactly(JIAHUI);
	}

	// --- party ---

	@Test
	void thePartyHasEachKakisRestrictionsInOptionOrder() {
		befriend(MEI, ARJUN);
		befriend(JIAHUI, MEI);

		List<PartyMember> party = service.party(MEI, ARJUN + ", " + JIAHUI);

		assertThat(party).extracting(PartyMember::id).containsExactly(ARJUN, JIAHUI);
		assertThat(party.get(0).displayName()).isEqualTo("Arjun");
		assertThat(party.get(0).restrictions()).containsExactly("HALAL", "NUT_ALLERGY");
		assertThat(party.get(1).restrictions()).isEmpty();
	}

	@Test
	void aPartyOfNonKakisIsForbidden() {
		befriend(MEI, ARJUN);
		asked(MEI, JIAHUI);

		assertThatThrownBy(() -> service.party(MEI, ARJUN + "," + JIAHUI)).isInstanceOf(ForbiddenException.class);
		assertThatThrownBy(() -> service.party(MEI, SIEW.toString())).isInstanceOf(ForbiddenException.class);
	}

	@Test
	void partyIdsMustBeValidAndAtMostNine() {
		befriend(MEI, ARJUN);
		String ten = IntStream.range(0, 10).mapToObj(i -> UUID.randomUUID().toString())
				.collect(Collectors.joining(","));

		assertThatThrownBy(() -> service.party(MEI, ten)).isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> service.party(MEI, "not-an-id")).isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> service.party(MEI, "")).isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> service.party(MEI, MEI + "," + ARJUN)).isInstanceOf(BadRequestException.class);
		// Repeats count once.
		assertThat(service.party(MEI, ARJUN + "," + ARJUN)).hasSize(1);
	}

	private KakiLink asked(UUID from, UUID to) {
		KakiLink link = new KakiLink(from, to);
		storedLinks.add(link);
		return link;
	}

	private KakiLink befriend(UUID requester, UUID addressee) {
		KakiLink link = asked(requester, addressee);
		link.accept();
		return link;
	}

	private KakiGroup group(UUID owner, String name, UUID... members) {
		KakiGroup group = new KakiGroup(owner, name, List.of(members));
		storedGroups.add(group);
		return group;
	}

	private static Profile person(UUID id, String displayName, String username, Restriction... restrictions) {
		Profile profile = new Profile() {
		};
		ReflectionTestUtils.setField(profile, "id", id);
		ReflectionTestUtils.setField(profile, "displayName", displayName);
		ReflectionTestUtils.setField(profile, "username", username);
		profile.changeDietaryNeeds(new DietaryNeeds(Set.of(restrictions), Set.of(), null));
		return profile;
	}
}
