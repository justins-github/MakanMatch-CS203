package com.makanmatch.catalog_service.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.catalog_service.common.ForbiddenException;
import com.makanmatch.catalog_service.common.UnauthorizedException;
import com.makanmatch.catalog_service.security.AccountClient.Me;
import com.makanmatch.catalog_service.security.AccountClient.OwnedVenue;
import com.makanmatch.catalog_service.security.VenueAccessPolicy.Access;

@ExtendWith(MockitoExtension.class)
class VenueAccessPolicyTest {

	private static final Caller CALLER = new Caller(UUID.randomUUID(), "token", null);
	private static final List<OwnedVenue> OWNS_TURKS = List.of(new OwnedVenue("turks-kebab", "Turk's Kebab"));

	@Mock
	AccountClient accounts;

	@InjectMocks
	VenueAccessPolicy policy;

	@Test
	void ownersManageTheirOwnVenue() {
		given(accounts.me(CALLER)).willReturn(Optional.of(new Me("id", "OWNER", OWNS_TURKS)));
		assertThat(policy.accessFor(CALLER, "turks-kebab")).isEqualTo(Access.MANAGER);
	}

	@Test
	void ownersAreOnlyDinersElsewhere() {
		given(accounts.me(CALLER)).willReturn(Optional.of(new Me("id", "OWNER", OWNS_TURKS)));
		assertThat(policy.accessFor(CALLER, "yangon-flavours")).isEqualTo(Access.DINER);
		assertThatThrownBy(() -> policy.requireManager(CALLER, "yangon-flavours"))
				.isInstanceOf(ForbiddenException.class);
	}

	@Test
	void anAdminActingAsAUserCannotManageEvenTheirOwnVenue() {
		// account-service already applied act-as: this request is served as USER.
		given(accounts.me(CALLER)).willReturn(Optional.of(new Me("id", "USER", OWNS_TURKS)));
		assertThat(policy.accessFor(CALLER, "turks-kebab")).isEqualTo(Access.DINER);
	}

	@Test
	void rejectedTokensAreUnauthorized() {
		given(accounts.me(CALLER)).willReturn(Optional.empty());
		assertThatThrownBy(() -> policy.accessFor(CALLER, "turks-kebab"))
				.isInstanceOf(UnauthorizedException.class);
	}
}
