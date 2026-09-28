package com.makanmatch.account_service.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.makanmatch.account_service.admin.dto.AdminUserResponse;
import com.makanmatch.account_service.admin.dto.UpdateUserRequest;
import com.makanmatch.account_service.common.ConflictException;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.Profile;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.supabase.SupabaseAuthClient;
import com.makanmatch.account_service.supabase.SupabaseUser;

@ExtendWith(MockitoExtension.class)
class UserAdminServiceTest {

	private static final UUID ME = UUID.randomUUID();
	private static final UUID OTHER = UUID.randomUUID();

	@Mock
	SupabaseAuthClient supabase;
	@Mock
	ProfileService profiles;
	@Mock
	OwnershipService ownership;

	UserAdminService service;

	@BeforeEach
	void setUp() {
		service = new UserAdminService(supabase, profiles, ownership);
	}

	@Test
	void adminsCannotChangeTheirOwnStatus() {
		assertThatThrownBy(() -> service.update(ME, ME, new UpdateUserRequest(false, null)))
				.isInstanceOf(ConflictException.class);
	}

	@Test
	void theLastActiveAdminCannotBeDemoted() {
		givenAccount(OTHER, true);
		given(profiles.countActiveAdmins()).willReturn(1L);

		assertThatThrownBy(() -> service.update(ME, OTHER, new UpdateUserRequest(false, null)))
				.isInstanceOf(ConflictException.class);
	}

	@Test
	void theLastActiveAdminCannotBeDisabled() {
		givenAccount(OTHER, true);
		given(profiles.countActiveAdmins()).willReturn(1L);

		assertThatThrownBy(() -> service.update(ME, OTHER, new UpdateUserRequest(null, true)))
				.isInstanceOf(ConflictException.class);
		verify(supabase, never()).setBanned(any(), anyBoolean());
	}

	@Test
	void disablingAnAccountAlsoBansItInSupabase() {
		Profile profile = givenAccount(OTHER, false);
		given(ownership.ownedBy(OTHER)).willReturn(List.of());

		AdminUserResponse result = service.update(ME, OTHER, new UpdateUserRequest(null, true));

		verify(supabase).setBanned(OTHER, true);
		assertThat(profile.isDisabled()).isTrue();
		assertThat(result.disabled()).isTrue();
	}

	@Test
	void promotingMakesAnAdmin() {
		Profile profile = givenAccount(OTHER, false);
		given(ownership.ownedBy(OTHER)).willReturn(List.of());

		service.update(ME, OTHER, new UpdateUserRequest(true, null));

		assertThat(profile.isAdmin()).isTrue();
	}

	private Profile givenAccount(UUID id, boolean admin) {
		Profile profile = new Profile() {
		};
		ReflectionTestUtils.setField(profile, "id", id);
		ReflectionTestUtils.setField(profile, "displayName", "Someone");
		profile.setAdmin(admin);
		given(supabase.getUser(id)).willReturn(
				new SupabaseUser(id, "someone@example.com", Map.of(), null, "2026-09-01T00:00:00Z", null));
		given(profiles.loadOrCreate(any(), any())).willReturn(profile);
		return profile;
	}
}
