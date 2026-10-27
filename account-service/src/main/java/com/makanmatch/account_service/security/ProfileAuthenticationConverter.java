package com.makanmatch.account_service.security;

import java.util.Map;
import java.util.UUID;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.Profile;
import com.makanmatch.account_service.profile.ProfileService;

/**
 * Runs after the token's signature, issuer, audience and expiry are verified.
 * Roles are read from our database on every request instead of being baked
 * into the token, so promoting, demoting or disabling takes effect immediately.
 *
 * Deliberately not a Spring bean: Spring MVC would otherwise register it as a
 * general-purpose type converter. SecurityConfig creates it.
 */
public class ProfileAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

	private final ProfileService profiles;
	private final OwnershipService ownership;
	private final ActAsResolver actAs;

	public ProfileAuthenticationConverter(ProfileService profiles, OwnershipService ownership, ActAsResolver actAs) {
		this.profiles = profiles;
		this.ownership = ownership;
		this.actAs = actAs;
	}

	@Override
	public AbstractAuthenticationToken convert(Jwt jwt) {
		UUID userId = UUID.fromString(jwt.getSubject());
		Profile profile = profiles.loadOrCreate(userId, fallbackDisplayName(jwt));
		if (profile.isDisabled()) {
			throw new DisabledException("This account has been disabled");
		}
		EffectiveRole role = actAs.resolve(profile.isAdmin(), ownership.ownsAny(userId), requestedRole());
		return new JwtAuthenticationToken(jwt, role.authorities(), jwt.getSubject());
	}

	private static String requestedRole() {
		if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
			return attributes.getRequest().getHeader(ActAsResolver.HEADER);
		}
		return null;
	}

	private static String fallbackDisplayName(Jwt jwt) {
		Map<String, Object> metadata = jwt.getClaimAsMap("user_metadata");
		if (metadata != null && metadata.get("display_name") instanceof String name && !name.isBlank()) {
			return name;
		}
		String email = jwt.getClaimAsString("email");
		return email != null && email.contains("@") ? email.substring(0, email.indexOf('@')) : null;
	}
}
