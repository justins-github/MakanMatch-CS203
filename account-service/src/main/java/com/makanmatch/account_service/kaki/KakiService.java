package com.makanmatch.account_service.kaki;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.account_service.common.BadRequestException;
import com.makanmatch.account_service.common.ConflictException;
import com.makanmatch.account_service.common.ForbiddenException;
import com.makanmatch.account_service.common.NotFoundException;
import com.makanmatch.account_service.kaki.dto.GroupResponse;
import com.makanmatch.account_service.kaki.dto.Kaki;
import com.makanmatch.account_service.kaki.dto.KakisResponse;
import com.makanmatch.account_service.kaki.dto.PartyMember;
import com.makanmatch.account_service.kaki.dto.SaveGroupRequest;
import com.makanmatch.account_service.profile.Profile;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.profile.UsernameRules;

/**
 * Kakis are people who agreed to eat together: one asks by username, the other
 * accepts. Only accepted kakis can go in a saved group or be matched as a party,
 * because group matching uses their Taste DNA and dietary needs.
 */
@Service
@Transactional
public class KakiService {

	/** Others in a group or party; with the owner that makes a table of ten. */
	static final int MAX_OTHERS = 9;
	private static final int MAX_GROUP_NAME = 40;

	private static final Comparator<Kaki> OLDEST_FIRST =
			Comparator.comparing(Kaki::since, Comparator.nullsLast(Comparator.naturalOrder()));
	private static final Comparator<Kaki> BY_NAME =
			Comparator.comparing(Kaki::displayName, Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER));

	private final KakiLinkRepository links;
	private final KakiGroupRepository savedGroups;
	private final ProfileService profiles;

	public KakiService(KakiLinkRepository links, KakiGroupRepository savedGroups, ProfileService profiles) {
		this.links = links;
		this.savedGroups = savedGroups;
		this.profiles = profiles;
	}

	/** What {@link #request} did: sent a new request, or accepted the one they had sent. */
	public record Added(KakisResponse kakis, boolean acceptedTheirs) {
	}

	@Transactional(readOnly = true)
	public KakisResponse kakis(UUID userId) {
		List<KakiLink> mine = links.findInvolving(userId);
		Map<UUID, Profile> people = profiles.findAll(mine.stream().map(link -> link.otherThan(userId)).toList());
		List<Kaki> kakis = new ArrayList<>();
		List<Kaki> incoming = new ArrayList<>();
		List<Kaki> outgoing = new ArrayList<>();
		for (KakiLink link : mine) {
			Kaki kaki = toKaki(people, link.otherThan(userId), link.since());
			if (link.isAccepted()) kakis.add(kaki);
			else if (link.getAddresseeId().equals(userId)) incoming.add(kaki);
			else outgoing.add(kaki);
		}
		kakis.sort(OLDEST_FIRST);
		incoming.sort(OLDEST_FIRST);
		outgoing.sort(OLDEST_FIRST);
		return new KakisResponse(kakis, incoming, outgoing);
	}

	public Added request(UUID userId, String username) {
		String wanted = typedUsername(username);
		if (wanted.isEmpty()) throw new BadRequestException("Type your friend's username");
		UUID otherId = profiles.findIdByUsername(wanted)
				.orElseThrow(() -> new NotFoundException("No one has that username"));
		if (otherId.equals(userId)) throw new BadRequestException("That's your own username");

		Optional<KakiLink> existing = links.findBetween(userId, otherId);
		if (existing.isPresent()) {
			KakiLink link = existing.get();
			if (link.isAccepted()) throw new ConflictException("You're already kakis");
			if (link.getRequesterId().equals(userId)) throw new ConflictException("You already asked them");
			// They asked first, so asking back means yes.
			link.accept();
			return new Added(kakis(userId), true);
		}
		try {
			links.saveAndFlush(new KakiLink(userId, otherId));
		}
		catch (DataIntegrityViolationException e) {
			// The one-link-per-pair index caught a request made at the same moment.
			throw new ConflictException("You two already have a request going - refresh to see it");
		}
		return new Added(kakis(userId), false);
	}

	public KakisResponse accept(UUID userId, UUID requesterId) {
		KakiLink link = links.findBetween(userId, requesterId)
				.filter(found -> !found.isAccepted() && found.getAddresseeId().equals(userId))
				.orElseThrow(() -> new NotFoundException("No request from them"));
		link.accept();
		return kakis(userId);
	}

	/**
	 * Decline, cancel and remove are the same thing: the link goes, and each
	 * person leaves the other's saved groups.
	 */
	public KakisResponse delete(UUID userId, UUID otherId) {
		KakiLink link = links.findBetween(userId, otherId)
				.orElseThrow(() -> new NotFoundException("You have no kaki or request with them"));
		links.delete(link);
		leaveGroups(userId, otherId);
		leaveGroups(otherId, userId);
		return kakis(userId);
	}

	/** The person's own groups, by name. */
	@Transactional(readOnly = true)
	public List<GroupResponse> groups(UUID userId) {
		List<KakiGroup> owned = savedGroups.findByOwnerId(userId);
		Map<UUID, Instant> kakis = acceptedKakis(userId);
		Map<UUID, Profile> people = profiles.findAll(
				owned.stream().flatMap(group -> group.getMemberIds().stream()).distinct().toList());
		return owned.stream()
				.map(group -> new GroupResponse(group.getId(), group.getName(), group.getMemberIds().stream()
						.map(id -> toKaki(people, id, kakis.get(id)))
						.sorted(BY_NAME)
						.toList()))
				.sorted(Comparator.comparing(GroupResponse::name, String.CASE_INSENSITIVE_ORDER))
				.toList();
	}

	public List<GroupResponse> createGroup(UUID userId, SaveGroupRequest request) {
		String name = checkedName(request.name());
		Set<UUID> members = checkedMembers(userId, request.memberIds());
		savedGroups.save(new KakiGroup(userId, name, members));
		return groups(userId);
	}

	public List<GroupResponse> updateGroup(UUID userId, UUID groupId, SaveGroupRequest request) {
		KakiGroup group = ownGroup(userId, groupId);
		group.update(checkedName(request.name()), checkedMembers(userId, request.memberIds()));
		return groups(userId);
	}

	public List<GroupResponse> deleteGroup(UUID userId, UUID groupId) {
		savedGroups.delete(ownGroup(userId, groupId));
		return groups(userId);
	}

	/**
	 * The people the engine is matching a place for, with the dietary restrictions
	 * it must respect. Only the caller's accepted kakis; the caller's own needs
	 * come from /api/me, so {@code ids} must not include the caller.
	 *
	 * @param ids comma-separated profile ids, at most {@value #MAX_OTHERS}
	 */
	@Transactional(readOnly = true)
	public List<PartyMember> party(UUID userId, String ids) {
		List<UUID> wanted = parseIds(ids);
		if (wanted.contains(userId)) throw new BadRequestException("Leave yourself out: you're always included");
		// One message for everyone, so this can't be used to probe who exists.
		if (!acceptedKakis(userId).keySet().containsAll(wanted)) {
			throw new ForbiddenException("Those people aren't all your kakis");
		}
		Map<UUID, Profile> people = profiles.findAll(wanted);
		return wanted.stream()
				.map(people::get)
				.filter(Objects::nonNull)
				.map(who -> new PartyMember(who.getId(), who.getDisplayName(),
						who.getDietaryNeeds().restrictions().stream().map(Enum::name).toList()))
				.toList();
	}

	/** Each accepted kaki's id, with when they became kakis. */
	private Map<UUID, Instant> acceptedKakis(UUID userId) {
		Map<UUID, Instant> kakis = new HashMap<>();
		for (KakiLink link : links.findInvolving(userId)) {
			if (link.isAccepted()) kakis.put(link.otherThan(userId), link.getAcceptedAt());
		}
		return kakis;
	}

	/** Takes the member out of the owner's groups. A group left with nobody is deleted, since groups have 1-9. */
	private void leaveGroups(UUID ownerId, UUID memberId) {
		for (KakiGroup group : savedGroups.findByOwnerIdAndMember(ownerId, memberId)) {
			group.removeMember(memberId);
			if (group.getMemberIds().isEmpty()) savedGroups.delete(group);
		}
	}

	private KakiGroup ownGroup(UUID userId, UUID groupId) {
		// Someone else's group looks the same as a missing one.
		return savedGroups.findByIdAndOwnerId(groupId, userId)
				.orElseThrow(() -> new NotFoundException("No such group"));
	}

	private Set<UUID> checkedMembers(UUID userId, Collection<UUID> memberIds) {
		Set<UUID> members = memberIds == null ? new LinkedHashSet<>() : new LinkedHashSet<>(memberIds);
		if (members.isEmpty() || members.size() > MAX_OTHERS) {
			throw new BadRequestException("A group has 1-" + MAX_OTHERS + " kakis");
		}
		if (!acceptedKakis(userId).keySet().containsAll(members)) {
			throw new BadRequestException("Only your kakis can be in a group");
		}
		return members;
	}

	private static String checkedName(String raw) {
		String name = raw == null ? "" : raw.trim();
		if (name.isEmpty()) throw new BadRequestException("Give the group a name");
		// Counted like Postgres char_length, so an emoji is one character.
		if (name.codePointCount(0, name.length()) > MAX_GROUP_NAME) {
			throw new BadRequestException("Group names are 1-" + MAX_GROUP_NAME + " characters");
		}
		return name;
	}

	/** "@JiaHui" and "jiahui" are the same person: usernames are stored lower-case, without the @. */
	private static String typedUsername(String raw) {
		String name = raw == null ? "" : raw.trim();
		if (name.startsWith("@")) name = name.substring(1);
		return UsernameRules.normalize(name);
	}

	private static List<UUID> parseIds(String raw) {
		Set<UUID> ids = new LinkedHashSet<>();
		for (String part : (raw == null ? "" : raw).split(",")) {
			if (part.isBlank()) continue;
			try {
				ids.add(UUID.fromString(part.trim()));
			}
			catch (IllegalArgumentException e) {
				throw new BadRequestException("ids must be comma-separated account ids");
			}
		}
		if (ids.isEmpty()) throw new BadRequestException("Pick at least one kaki");
		if (ids.size() > MAX_OTHERS) throw new BadRequestException("At most " + MAX_OTHERS + " kakis at a time");
		return List.copyOf(ids);
	}

	private static Kaki toKaki(Map<UUID, Profile> people, UUID id, Instant since) {
		Profile who = people.get(id);
		return who == null
				? new Kaki(id, null, null, since)
				: new Kaki(id, who.getDisplayName(), who.getUsername(), since);
	}
}
