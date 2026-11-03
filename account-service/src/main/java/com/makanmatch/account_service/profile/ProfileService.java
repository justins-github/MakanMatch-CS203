package com.makanmatch.account_service.profile;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.account_service.common.BadRequestException;
import com.makanmatch.account_service.common.ConflictException;
import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.common.ForbiddenException;
import com.makanmatch.account_service.common.NotFoundException;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.dto.MeResponse;
import com.makanmatch.account_service.profile.dto.UpdateProfileRequest;
import com.makanmatch.account_service.supabase.SupabaseAuthClient;
import com.makanmatch.account_service.supabase.SupabaseAuthException;
import com.makanmatch.account_service.supabase.SupabaseSession;

@Service
@Transactional
public class ProfileService {

	private static final int MAX_DISPLAY_NAME = 40;

	private final ProfileRepository profiles;
	private final OwnershipService ownership;
	private final SupabaseAuthClient supabase;

	public ProfileService(ProfileRepository profiles, OwnershipService ownership, SupabaseAuthClient supabase) {
		this.profiles = profiles;
		this.ownership = ownership;
		this.supabase = supabase;
	}

	/**
	 * The account's profile, created on first sight. Covers users created outside
	 * our sign-up endpoint (Supabase dashboard, seed script).
	 */
	public Profile loadOrCreate(UUID id, String fallbackDisplayName) {
		return profiles.findById(id).orElseGet(() -> {
			profiles.insertIfAbsent(id, clampName(fallbackDisplayName));
			return profiles.findById(id).orElseThrow();
		});
	}

	/** @param dietary null when the sign-up form skipped it */
	public void createForSignup(UUID id, String displayName, DietaryNeeds dietary) {
		Profile profile = loadOrCreate(id, displayName);
		profile.rename(clampName(displayName));
		if (dietary != null) profile.changeDietaryNeeds(dietary);
	}

	@Transactional(readOnly = true)
	public Profile get(UUID id) {
		return profiles.findById(id).orElseThrow(() -> new NotFoundException("No such account"));
	}

	@Transactional(readOnly = true)
	public Map<UUID, Profile> findAll(Collection<UUID> ids) {
		return profiles.findAllById(ids).stream().collect(Collectors.toMap(Profile::getId, Function.identity()));
	}

	@Transactional(readOnly = true)
	public Optional<UUID> findIdByUsername(String username) {
		return profiles.findByUsername(UsernameRules.normalize(username)).map(Profile::getId);
	}

	/** The account's real admin flag, whatever role it's being viewed as. */
	@Transactional(readOnly = true)
	public boolean isAdmin(UUID id) {
		return get(id).isAdmin();
	}

	@Transactional(readOnly = true)
	public long countActiveAdmins() {
		return profiles.countByAdminTrueAndDisabledFalse();
	}

	/**
	 * @param role the role to report; null means the account's natural role
	 */
	@Transactional(readOnly = true)
	public MeResponse me(UUID id, String email, EffectiveRole role) {
		Profile profile = get(id);
		EffectiveRole reported = role != null ? role : EffectiveRole.natural(profile.isAdmin(), ownership.ownsAny(id));
		return new MeResponse(profile.getId(), email, profile.getDisplayName(), profile.getUsername(),
				profile.getDietaryNeeds(), profile.isAdmin(), reported, ownership.ownedBy(id), profile.getCreatedAt());
	}

	public MeResponse update(UUID id, String email, EffectiveRole role, UpdateProfileRequest request) {
		Profile profile = get(id);
		if (request.displayName() != null) {
			String name = request.displayName().trim();
			if (name.isEmpty()) throw new BadRequestException("Display name can't be blank");
			profile.rename(clampName(name));
		}
		if (request.username() != null) {
			profile.changeUsername(checkedUsername(id, request.username()));
		}
		if (request.dietary() != null) {
			profile.changeDietaryNeeds(request.dietary());
		}
		try {
			profiles.saveAndFlush(profile);
		}
		catch (DataIntegrityViolationException e) {
			throw new ConflictException("That username is taken");
		}
		return me(id, email, role);
	}

	/**
	 * Re-checks the current password with Supabase before setting the new one,
	 * so a stolen access token alone can't take over the account.
	 */
	public void changePassword(UUID id, String email, String currentPassword, String newPassword) {
		SupabaseSession check = verifyPassword(email, currentPassword);
		try {
			supabase.updatePassword(id, newPassword);
		}
		catch (SupabaseAuthException e) {
			if (e.isClientError()) throw new BadRequestException(e.getMessage());
			throw e;
		}
		finally {
			signOutQuietly(check.accessToken());
		}
	}

	/**
	 * Asked before the engine and the catalog forget the account, so a wrong
	 * password or a last admin is caught while there is still nothing to undo.
	 */
	@Transactional(readOnly = true)
	public void checkCanDelete(UUID id, String email, String password) {
		Profile profile = get(id);
		if (profile.isAdmin() && !profile.isDisabled() && countActiveAdmins() <= 1) {
			throw new ConflictException("You're the only admin - make someone else an admin first");
		}
		signOutQuietly(verifyPassword(email, password).accessToken());
	}

	/**
	 * The last step of deleting an account. Deleting the Supabase user ends every
	 * session, and its row in auth.users takes the profile with it (foreign key), and
	 * the profile its kakis, saved groups, venue claims and venue ownership. If
	 * Supabase fails, nothing is gone and the person can simply try again.
	 *
	 * No transaction on purpose: Supabase deletes in this same database, and its
	 * cascade would wait for any lock we held on the profile row (until our timeout).
	 * deleteById afterwards only matters where that foreign key doesn't exist.
	 */
	@Transactional(propagation = Propagation.NOT_SUPPORTED)
	public void delete(UUID id, String email, String password) {
		checkCanDelete(id, email, password);
		try {
			supabase.deleteUser(id);
		}
		catch (SupabaseAuthException e) {
			if (e.status() != 404) throw e;
		}
		profiles.deleteById(id);
	}

	private SupabaseSession verifyPassword(String email, String password) {
		if (email == null) throw new BadRequestException("This account has no email to verify the password against");
		try {
			return supabase.signInWithPassword(email, password);
		}
		catch (SupabaseAuthException e) {
			if (e.status() == 429) throw new BadRequestException("Too many attempts - wait a minute and try again");
			if (e.isClientError()) throw new ForbiddenException("Current password is incorrect");
			throw e;
		}
	}

	/** Null means "remove the username". */
	private String checkedUsername(UUID id, String requested) {
		String username = UsernameRules.normalize(requested);
		if (username.isEmpty()) return null;
		UsernameRules.problem(username).ifPresent(message -> {
			throw new BadRequestException(message);
		});
		if (profiles.existsByUsernameAndIdNot(username, id)) throw new ConflictException("That username is taken");
		return username;
	}

	private void signOutQuietly(String accessToken) {
		try {
			supabase.signOut(accessToken);
		}
		catch (SupabaseAuthException ignored) {
			// the throwaway verification session simply expires on its own
		}
	}

	private static String clampName(String name) {
		String trimmed = name == null || name.isBlank() ? "MakanMatch user" : name.trim();
		return trimmed.length() > MAX_DISPLAY_NAME ? trimmed.substring(0, MAX_DISPLAY_NAME) : trimmed;
	}
}
