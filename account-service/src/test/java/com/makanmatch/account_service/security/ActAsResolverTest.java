package com.makanmatch.account_service.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;

import com.makanmatch.account_service.common.EffectiveRole;

class ActAsResolverTest {

	private final ActAsResolver resolver = new ActAsResolver();

	@Test
	void everyoneGetsTheirNaturalRoleWithoutTheHeader() {
		assertThat(resolver.resolve(false, false, null)).isEqualTo(EffectiveRole.USER);
		assertThat(resolver.resolve(false, true, null)).isEqualTo(EffectiveRole.OWNER);
		assertThat(resolver.resolve(true, false, "")).isEqualTo(EffectiveRole.ADMIN);
	}

	@Test
	void nonAdminsCannotRaiseTheirRoleWithTheHeader() {
		assertThat(resolver.resolve(false, false, "admin")).isEqualTo(EffectiveRole.USER);
		assertThat(resolver.resolve(false, false, "owner")).isEqualTo(EffectiveRole.USER);
		assertThat(resolver.resolve(false, true, "admin")).isEqualTo(EffectiveRole.OWNER);
	}

	@Test
	void adminsCanActAsAnyRole() {
		assertThat(resolver.resolve(true, false, "user")).isEqualTo(EffectiveRole.USER);
		assertThat(resolver.resolve(true, true, " Owner ")).isEqualTo(EffectiveRole.OWNER);
		assertThat(resolver.resolve(true, false, "ADMIN")).isEqualTo(EffectiveRole.ADMIN);
	}

	@Test
	void unknownHeaderValuesAreIgnored() {
		assertThat(resolver.resolve(true, false, "superuser")).isEqualTo(EffectiveRole.ADMIN);
	}

	@Test
	void eachRoleIncludesTheRolesBelowIt() {
		assertThat(EffectiveRole.USER.authorities()).extracting(GrantedAuthority::getAuthority)
				.containsExactly("ROLE_USER");
		assertThat(EffectiveRole.ADMIN.authorities()).extracting(GrantedAuthority::getAuthority)
				.containsExactly("ROLE_USER", "ROLE_OWNER", "ROLE_ADMIN");
		for (EffectiveRole role : EffectiveRole.values()) {
			assertThat(EffectiveRole.fromAuthorities(role.authorities())).isEqualTo(role);
		}
	}
}
