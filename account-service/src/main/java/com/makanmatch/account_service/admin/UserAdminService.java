package com.makanmatch.account_service.admin;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.account_service.admin.dto.AdminUserResponse;
import com.makanmatch.account_service.admin.dto.UpdateUserRequest;
import com.makanmatch.account_service.common.ConflictException;
import com.makanmatch.account_service.common.NotFoundException;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.owner.dto.OwnedVenueResponse;
import com.makanmatch.account_service.profile.Profile;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.supabase.SupabaseAuthClient;
import com.makanmatch.account_service.supabase.SupabaseAuthException;
import com.makanmatch.account_service.supabase.SupabaseUser;

/**
 * Admin account management. Guard rails: an admin can't change their own
 * admin/disabled status, and the last active admin can't be removed.
 */
@Service
@Transactional
public class UserAdminService {

	private final SupabaseAuthClient supabase;
	private final ProfileService profiles;
	private final OwnershipService ownership;

	public UserAdminService(SupabaseAuthClient supabase, ProfileService profiles, OwnershipService ownership) {
		this.supabase = supabase;
		this.profiles = profiles;
		this.ownership = ownership;
	}

	/** @param query optional case-insensitive match on email, display name or username */
	@Transactional(readOnly = true)
	public List<AdminUserResponse> list(String query) {
		List<SupabaseUser> users = supabase.listUsers();
		List<UUID> ids = users.stream().map(SupabaseUser::id).toList();
		Map<UUID, Profile> byId = profiles.findAll(ids);
		Map<UUID, List<OwnedVenueResponse>> venues = ownership.ownedByEach(ids);
		String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
		return users.stream()
				.map(user -> toResponse(user, byId.get(user.id()), venues.getOrDefault(user.id(), List.of())))
				.filter(row -> needle.isEmpty() || matches(row, needle))
				.sorted(Comparator.comparing(AdminUserResponse::createdAt,
						Comparator.nullsLast(Comparator.reverseOrder())))
				.toList();
	}

	public AdminUserResponse update(UUID actingAdminId, UUID targetId, UpdateUserRequest request) {
		if (actingAdminId.equals(targetId)) {
			throw new ConflictException("You can't change your own admin or disabled status");
		}
		SupabaseUser user = fetchUser(targetId);
		Profile profile = profiles.loadOrCreate(targetId, displayNameOf(user));
		boolean removesAnActiveAdmin = profile.isAdmin() && !profile.isDisabled()
				&& (Boolean.FALSE.equals(request.admin()) || Boolean.TRUE.equals(request.disabled()));
		if (removesAnActiveAdmin && profiles.countActiveAdmins() <= 1) {
			throw new ConflictException("At least one active admin must remain");
		}
		if (request.admin() != null) {
			profile.setAdmin(request.admin());
		}
		if (request.disabled() != null && request.disabled() != profile.isDisabled()) {
			supabase.setBanned(targetId, request.disabled());
			profile.setDisabled(request.disabled());
		}
		return toResponse(user, profile, ownership.ownedBy(targetId));
	}

	public void revokeOwnership(UUID targetId, String venueId) {
		ownership.revoke(targetId, venueId);
	}

	private SupabaseUser fetchUser(UUID id) {
		try {
			return supabase.getUser(id);
		}
		catch (SupabaseAuthException e) {
			if (e.status() == 404) throw new NotFoundException("No such account");
			throw e;
		}
	}

	private static AdminUserResponse toResponse(SupabaseUser user, Profile profile, List<OwnedVenueResponse> venues) {
		return new AdminUserResponse(
				user.id(),
				user.email(),
				profile != null ? profile.getDisplayName() : displayNameOf(user),
				profile != null ? profile.getUsername() : null,
				profile != null && profile.isAdmin(),
				profile != null && profile.isDisabled(),
				venues,
				user.createdAt(),
				user.lastSignInAt());
	}

	private static boolean matches(AdminUserResponse row, String needle) {
		return Stream.of(row.email(), row.displayName(), row.username())
				.anyMatch(value -> value != null && value.toLowerCase(Locale.ROOT).contains(needle));
	}

	private static String displayNameOf(SupabaseUser user) {
		if (user.displayName() != null) return user.displayName();
		String email = user.email();
		return email != null && email.contains("@") ? email.substring(0, email.indexOf('@')) : null;
	}
}
