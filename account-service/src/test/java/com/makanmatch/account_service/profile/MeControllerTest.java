package com.makanmatch.account_service.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
import com.makanmatch.account_service.profile.DietaryNeeds.Preference;
import com.makanmatch.account_service.profile.DietaryNeeds.Restriction;
import com.makanmatch.account_service.profile.DietaryNeeds.SpiceLevel;
import com.makanmatch.account_service.profile.dto.MeResponse;
import com.makanmatch.account_service.profile.dto.UpdateProfileRequest;
import com.makanmatch.account_service.security.ActAsResolver;

/** /api/me plus the role gates in SecurityConfig, exercised through real HTTP routing. */
@WebMvcTest(controllers = { MeController.class, UserAdminController.class })
@Import({ SecurityConfig.class, ApiExceptionHandler.class })
class MeControllerTest {

	private static final UUID ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
	private static final DietaryNeeds NO_DIET = new DietaryNeeds(Set.of(), Set.of(), null);

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
				"diner@example.com", "Diner", "diner", NO_DIET, false, EffectiveRole.OWNER,
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
				new MeResponse(ID, "diner@example.com", "New name", null, NO_DIET, false, EffectiveRole.USER, List.of(),
						Instant.EPOCH));
		mvc.perform(patch("/api/me").with(signedIn(EffectiveRole.USER))
				.contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"New name\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value("New name"));
	}

	@Test
	void meIncludesTheDietaryNeedsInOptionOrder() throws Exception {
		given(profiles.me(ID, "diner@example.com", EffectiveRole.USER)).willReturn(new MeResponse(ID,
				"diner@example.com", "Diner", null,
				new DietaryNeeds(Set.of(Restriction.NUT_ALLERGY, Restriction.HALAL), Set.of(Preference.LESS_OILY),
						SpiceLevel.HOT),
				false, EffectiveRole.USER, List.of(), Instant.EPOCH));

		mvc.perform(get("/api/me").with(signedIn(EffectiveRole.USER)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.dietary.restrictions", contains("HALAL", "NUT_ALLERGY")))
				.andExpect(jsonPath("$.dietary.preferences", contains("LESS_OILY")))
				.andExpect(jsonPath("$.dietary.spiceLevel").value("HOT"));
	}

	@Test
	void dietaryNeedsAreReadFromTheRequestWithMissingListsAsEmpty() throws Exception {
		given(profiles.update(eq(ID), eq("diner@example.com"), eq(EffectiveRole.USER), any())).willReturn(
				new MeResponse(ID, "diner@example.com", "Diner", null, NO_DIET, false, EffectiveRole.USER, List.of(),
						Instant.EPOCH));

		mvc.perform(patch("/api/me").with(signedIn(EffectiveRole.USER)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"dietary\":{\"restrictions\":[\"NUT_ALLERGY\",\"HALAL\"],\"spiceLevel\":\"MILD\"}}"))
				.andExpect(status().isOk());

		ArgumentCaptor<UpdateProfileRequest> sent = ArgumentCaptor.forClass(UpdateProfileRequest.class);
		verify(profiles).update(eq(ID), any(), any(), sent.capture());
		assertThat(sent.getValue().dietary()).isEqualTo(
				new DietaryNeeds(Set.of(Restriction.HALAL, Restriction.NUT_ALLERGY), Set.of(), SpiceLevel.MILD));
	}

	@Test
	void unknownDietaryOptionsAreRejected() throws Exception {
		mvc.perform(patch("/api/me").with(signedIn(EffectiveRole.USER)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"dietary\":{\"restrictions\":[\"KETO\"]}}"))
				.andExpect(status().isBadRequest());
		verify(profiles, never()).update(any(), any(), any(), any());
	}

	@Test
	void deleteCheckAndDeleteUseTheCallersOwnAccount() throws Exception {
		mvc.perform(post("/api/me/delete-check").with(signedIn(EffectiveRole.USER))
				.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"right-pass1\"}"))
				.andExpect(status().isNoContent());
		mvc.perform(post("/api/me/delete").with(signedIn(EffectiveRole.USER))
				.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"right-pass1\"}"))
				.andExpect(status().isNoContent());

		verify(profiles).checkCanDelete(ID, "diner@example.com", "right-pass1");
		verify(profiles).delete(ID, "diner@example.com", "right-pass1");
	}

	@Test
	void deletingNeedsThePassword() throws Exception {
		mvc.perform(post("/api/me/delete").with(signedIn(EffectiveRole.USER))
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.password").exists());
		verify(profiles, never()).delete(any(), any(), any());
	}

	@Test
	void deletingNeedsASignedInCaller() throws Exception {
		mvc.perform(post("/api/me/delete").contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"right-pass1\"}"))
				.andExpect(status().isUnauthorized());
	}

	private static RequestPostProcessor signedIn(EffectiveRole role) {
		return jwt().jwt(token -> token.subject(ID.toString()).claim("email", "diner@example.com"))
				.authorities(role.authorities());
	}
}
