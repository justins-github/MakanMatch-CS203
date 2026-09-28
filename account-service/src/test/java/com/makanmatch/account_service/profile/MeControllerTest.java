package com.makanmatch.account_service.profile;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.makanmatch.account_service.admin.UserAdminController;
import com.makanmatch.account_service.admin.UserAdminService;
import com.makanmatch.account_service.common.ApiExceptionHandler;
import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.config.SecurityConfig;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.owner.dto.OwnedVenueResponse;
import com.makanmatch.account_service.profile.dto.MeResponse;
import com.makanmatch.account_service.security.ActAsResolver;

/** /api/me plus the role gates in SecurityConfig, exercised through real HTTP routing. */
@WebMvcTest(controllers = { MeController.class, UserAdminController.class })
@Import({ SecurityConfig.class, ApiExceptionHandler.class })
class MeControllerTest {

	private static final UUID ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

	@Autowired
	MockMvc mvc;

	@MockitoBean
	ProfileService profiles;
	@MockitoBean
	OwnershipService ownership;
	@MockitoBean
	ActAsResolver actAs;
	@MockitoBean
	UserAdminService userAdmin;
	@MockitoBean
	JwtDecoder jwtDecoder;

	@Test
	void requestsWithoutATokenAreRejected() throws Exception {
		mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
	}

	@Test
	void returnsTheProfileWithTheRoleThisRequestIsServedAs() throws Exception {
		given(profiles.me(ID, "diner@example.com", EffectiveRole.OWNER)).willReturn(new MeResponse(ID,
				"diner@example.com", "Diner", "diner", false, EffectiveRole.OWNER,
				List.of(new OwnedVenueResponse("turks-kebab", "Turk's Kebab", Instant.EPOCH)), Instant.EPOCH));

		mvc.perform(get("/api/me").with(signedIn(EffectiveRole.OWNER)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.effectiveRole").value("OWNER"))
				.andExpect(jsonPath("$.ownedVenues[0].venueId").value("turks-kebab"));
	}

	@Test
	void invalidUsernamesAreRejectedWithTheFieldNamed() throws Exception {
		mvc.perform(patch("/api/me").with(signedIn(EffectiveRole.USER))
				.contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"9-lives\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.username").exists());
	}

	@Test
	void adminRoutesNeedTheAdminRole() throws Exception {
		mvc.perform(get("/api/admin/users").with(signedIn(EffectiveRole.OWNER)))
				.andExpect(status().isForbidden());
	}

	@Test
	void adminActingAsUserLosesAdminRoutes() throws Exception {
		// An admin who picked "user" in the role switcher is served as USER.
		mvc.perform(get("/api/admin/users").with(signedIn(EffectiveRole.USER)))
				.andExpect(status().isForbidden());
	}

	@Test
	void adminsReachAdminRoutes() throws Exception {
		given(userAdmin.list(any())).willReturn(List.of());
		mvc.perform(get("/api/admin/users").with(signedIn(EffectiveRole.ADMIN)))
				.andExpect(status().isOk());
	}

	@Test
	void profileUpdatesPassTheRoleThrough() throws Exception {
		given(profiles.update(eq(ID), eq("diner@example.com"), eq(EffectiveRole.USER), any())).willReturn(
				new MeResponse(ID, "diner@example.com", "New name", null, false, EffectiveRole.USER, List.of(),
						Instant.EPOCH));
		mvc.perform(patch("/api/me").with(signedIn(EffectiveRole.USER))
				.contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"New name\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value("New name"));
	}

	private static RequestPostProcessor signedIn(EffectiveRole role) {
		return jwt().jwt(token -> token.subject(ID.toString()).claim("email", "diner@example.com"))
				.authorities(role.authorities());
	}
}
