package com.makanmatch.account_service.profile;

import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Usernames are optional login aliases: 3-20 characters, start with a letter,
 * then letters, digits or underscores. They are stored lower-case, so "Justin"
 * and "justin" are the same name, and can never be mistaken for an email.
 */
public final class UsernameRules {

	private static final Pattern FORMAT = Pattern.compile("^[a-z][a-z0-9_]{2,19}$");

	private static final Set<String> RESERVED = Set.of(
			"admin", "administrator", "root", "system", "support", "help", "api",
			"makanmatch", "owner", "moderator", "staff", "me", "null", "undefined");

	private UsernameRules() {
	}

	public static String normalize(String raw) {
		return raw == null ? null : raw.trim().toLowerCase(Locale.ROOT);
	}

	/** Why a normalized username can't be used, or empty when it's fine. */
	public static Optional<String> problem(String normalized) {
		if (normalized == null || !FORMAT.matcher(normalized).matches()) {
			return Optional.of("Usernames are 3-20 letters, digits or underscores, starting with a letter");
		}
		if (RESERVED.contains(normalized)) {
			return Optional.of("That username is reserved");
		}
		return Optional.empty();
	}
}
