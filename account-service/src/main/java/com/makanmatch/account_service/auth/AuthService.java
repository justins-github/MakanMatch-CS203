package com.makanmatch.account_service.auth;

import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.makanmatch.account_service.auth.dto.LoginRequest;
import com.makanmatch.account_service.auth.dto.SignupRequest;
import com.makanmatch.account_service.common.BadRequestException;
import com.makanmatch.account_service.common.ConflictException;
import com.makanmatch.account_service.common.ForbiddenException;
import com.makanmatch.account_service.common.UnauthorizedException;
import com.makanmatch.account_service.profile.Profile;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.supabase.SupabaseAuthClient;
import com.makanmatch.account_service.supabase.SupabaseAuthException;
import com.makanmatch.account_service.supabase.SupabaseSession;
import com.makanmatch.account_service.supabase.SupabaseUser;

/**
 * Sign-up, login, refresh and logout on top of Supabase Auth. Supabase checks
 * passwords and issues tokens; we add usernames, profiles and disabled accounts.
 */
@Service
public class AuthService {

	/** One message for every login failure, so it never reveals which accounts exist. */
	private static final String INVALID_CREDENTIALS = "Wrong email/username or password";

	private final SupabaseAuthClient supabase;
	private final ProfileService profiles;

	public AuthService(SupabaseAuthClient supabase, ProfileService profiles) {
		this.supabase = supabase;
		this.profiles = profiles;
	}

	public AuthResult signup(SignupRequest request) {
		String email = request.email().trim().toLowerCase(Locale.ROOT);
		String displayName = request.displayName().trim();
		SupabaseUser user;
		try {
			user = supabase.createUser(email, request.password(), displayName);
		}
		catch (SupabaseAuthException e) {
			if (e.hasCode("email_exists", "user_already_exists") || e.status() == 422 && mentionsExisting(e)) {
				throw new ConflictException("An account with this email already exists");
			}
			if (e.isClientError()) throw new BadRequestException(e.getMessage());
			throw e;
		}
		profiles.createForSignup(user.id(), displayName, request.dietary());
		return new AuthResult(signIn(email, request.password()), user.id());
	}

	public AuthResult login(LoginRequest request) {
		String email = resolveEmail(request.identifier().trim());
		SupabaseSession session = signIn(email, request.password());
		UUID userId = session.user().id();
		Profile profile = profiles.loadOrCreate(userId, session.user().displayName());
		if (profile.isDisabled()) {
			signOutQuietly(session.accessToken());
			throw new ForbiddenException("This account has been disabled");
		}
		return new AuthResult(session, userId);
	}

	public SupabaseSession refresh(String refreshToken) {
		try {
			return supabase.refresh(refreshToken);
		}
		catch (SupabaseAuthException e) {
			if (e.isClientError()) throw new UnauthorizedException("Your session has ended - please sign in again");
			throw e;
		}
	}

	/**
	 * Ends the Supabase session so its refresh token can never be used again.
	 * The refresh token is swapped for a fresh access token first, because the
	 * one the browser holds may already have expired. Best effort: the cookie is
	 * cleared either way.
	 */
	public void logout(String refreshToken) {
		if (refreshToken == null || refreshToken.isBlank()) return;
		try {
			signOutQuietly(supabase.refresh(refreshToken).accessToken());
		}
		catch (SupabaseAuthException ignored) {
			// session already ended
		}
	}

	private void signOutQuietly(String accessToken) {
		try {
			supabase.signOut(accessToken);
		}
		catch (SupabaseAuthException ignored) {
			// already expired or revoked
		}
	}

	private SupabaseSession signIn(String email, String password) {
		try {
			return supabase.signInWithPassword(email, password);
		}
		catch (SupabaseAuthException e) {
			if (e.hasCode("user_banned")) throw new ForbiddenException("This account has been disabled");
			if (e.status() == 429) throw new BadRequestException("Too many attempts - wait a minute and try again");
			if (e.isClientError()) throw new UnauthorizedException(INVALID_CREDENTIALS);
			throw e;
		}
	}

	/** Emails contain '@' and usernames never do, so the identifier is unambiguous. */
	private String resolveEmail(String identifier) {
		if (identifier.contains("@")) return identifier.toLowerCase(Locale.ROOT);
		UUID userId = profiles.findIdByUsername(identifier)
				.orElseThrow(() -> new UnauthorizedException(INVALID_CREDENTIALS));
		try {
			return supabase.getUser(userId).email();
		}
		catch (SupabaseAuthException e) {
			if (e.status() == 404) throw new UnauthorizedException(INVALID_CREDENTIALS);
			throw e;
		}
	}

	private static boolean mentionsExisting(SupabaseAuthException e) {
		return e.getMessage() != null && e.getMessage().toLowerCase(Locale.ROOT).contains("already");
	}

	/** A fresh Supabase session plus whose it is. */
	public record AuthResult(SupabaseSession session, UUID userId) {
	}
}
