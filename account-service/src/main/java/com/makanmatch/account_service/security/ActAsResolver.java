package com.makanmatch.account_service.security;

import java.util.Locale;

import org.springframework.stereotype.Component;

import com.makanmatch.account_service.common.EffectiveRole;

/**
 * Admins can view the app as a user or an owner for debugging. The server then
 * applies exactly that role's permissions, so what an admin sees while acting as
 * an owner is what a real owner gets. Everyone else keeps their natural role:
 * the header can only ever lower an admin, never raise anyone.
 */
@Component
public class ActAsResolver {

	public static final String HEADER = "X-Act-As";

	public EffectiveRole resolve(boolean admin, boolean ownsAnyVenue, String requested) {
		EffectiveRole natural = EffectiveRole.natural(admin, ownsAnyVenue);
		if (!admin || requested == null || requested.isBlank()) return natural;
		try {
			return EffectiveRole.valueOf(requested.trim().toUpperCase(Locale.ROOT));
		}
		catch (IllegalArgumentException unknown) {
			return natural;
		}
	}
}
