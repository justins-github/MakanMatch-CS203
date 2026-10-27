package com.makanmatch.account_service.common;

import java.util.Collection;
import java.util.List;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * The role a request is served with. Each role includes the ones below it.
 * An admin may choose a lower role with the X-Act-As header to see exactly what
 * that role sees; everyone else always gets their natural role.
 */
public enum EffectiveRole {
	USER, OWNER, ADMIN;

	/** The role an account has when it doesn't ask to act as anything else. */
	public static EffectiveRole natural(boolean admin, boolean ownsAnyVenue) {
		return admin ? ADMIN : ownsAnyVenue ? OWNER : USER;
	}

	/** Spring Security authorities for this role, e.g. OWNER gives ROLE_USER and ROLE_OWNER. */
	public List<GrantedAuthority> authorities() {
		return switch (this) {
			case USER -> List.of(authority(USER));
			case OWNER -> List.of(authority(USER), authority(OWNER));
			case ADMIN -> List.of(authority(USER), authority(OWNER), authority(ADMIN));
		};
	}

	/** The highest role present in a set of authorities (USER when none match). */
	public static EffectiveRole fromAuthorities(Collection<? extends GrantedAuthority> authorities) {
		EffectiveRole best = USER;
		for (GrantedAuthority granted : authorities) {
			for (EffectiveRole role : values()) {
				if (authority(role).getAuthority().equals(granted.getAuthority()) && role.ordinal() > best.ordinal()) {
					best = role;
				}
			}
		}
		return best;
	}

	private static SimpleGrantedAuthority authority(EffectiveRole role) {
		return new SimpleGrantedAuthority("ROLE_" + role.name());
	}
}
