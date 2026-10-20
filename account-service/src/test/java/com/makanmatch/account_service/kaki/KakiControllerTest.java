package com.makanmatch.account_service.kaki;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

import com.makanmatch.account_service.common.ApiExceptionHandler;
import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.common.ForbiddenException;
import com.makanmatch.account_service.config.SecurityConfig;
import com.makanmatch.account_service.kaki.dto.GroupResponse;
import com.makanmatch.account_service.kaki.dto.Kaki;
import com.makanmatch.account_service.kaki.dto.KakisResponse;
import com.makanmatch.account_service.kaki.dto.PartyMember;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.security.ActAsResolver;

/** /api/kakis through real HTTP routing and SecurityConfig; the rules themselves are in KakiServiceTest. */
@WebMvcTest(controllers = KakiController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class })
class KakiControllerTest {

	private static final UUID ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
	private static final UUID JIAHUI = UUID.fromString("22222222-2222-2222-2222-222222222222");
	private static final Kaki JIAHUI_KAKI = new Kaki(JIAHUI, "Jia Hui", "jiahui", Instant.EPOCH);

	@Autowired
	MockMvc mvc;

	@MockitoBean
	KakiService kakis;
	@MockitoBean
	ProfileService profiles;
	@MockitoBean
	OwnershipService ownership;
	@MockitoBean
	ActAsResolver actAs;
	@MockitoBean
	JwtDecoder jwtDecoder;

	@Test
	void requestsWithoutATokenAreRejected() throws Exception {
		mvc.perform(get("/api/kakis")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/kakis/party").param("ids", JIAHUI.toString())).andExpect(status().isUnauthorized());
	}

	@Test
	void listsMyKakisAndRequests() throws Exception {
		given(kakis.kakis(ID)).willReturn(new KakisResponse(List.of(JIAHUI_KAKI), List.of(), List.of()));

		mvc.perform(get("/api/kakis").with(signedIn()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.kakis[0].id").value(JIAHUI.toString()))
				.andExpect(jsonPath("$.kakis[0].username").value("jiahui"))
				.andExpect(jsonPath("$.kakis[0].since").exists())
				.andExpect(jsonPath("$.incoming").isEmpty())
				.andExpect(jsonPath("$.outgoing").isEmpty());
	}

	@Test
	void aNewRequestIsCreated() throws Exception {
		given(kakis.request(ID, "@JiaHui")).willReturn(
				new KakiService.Added(new KakisResponse(List.of(), List.of(), List.of(JIAHUI_KAKI)), false));

		mvc.perform(post("/api/kakis/requests").with(signedIn())
				.contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"@JiaHui\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.outgoing[0].displayName").value("Jia Hui"));
	}

	@Test
	void askingSomeoneWhoAskedYouIsAnOrdinarySuccess() throws Exception {
		given(kakis.request(ID, "jiahui")).willReturn(
				new KakiService.Added(new KakisResponse(List.of(JIAHUI_KAKI), List.of(), List.of()), true));

		mvc.perform(post("/api/kakis/requests").with(signedIn())
				.contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"jiahui\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.kakis[0].id").value(JIAHUI.toString()));
	}

	@Test
	void aBlankUsernameNeverReachesTheService() throws Exception {
		mvc.perform(post("/api/kakis/requests").with(signedIn())
				.contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"  \"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.username").exists());
		verify(kakis, never()).request(any(), any());
	}

	@Test
	void savingAGroupReturnsAllMyGroups() throws Exception {
		UUID groupId = UUID.randomUUID();
		given(kakis.createGroup(eq(ID), any())).willReturn(
				List.of(new GroupResponse(groupId, "Thursday lunch crew", List.of(JIAHUI_KAKI))));

		mvc.perform(post("/api/kakis/groups").with(signedIn()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"Thursday lunch crew\",\"memberIds\":[\"" + JIAHUI + "\"]}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$[0].name").value("Thursday lunch crew"))
				.andExpect(jsonPath("$[0].members[0].id").value(JIAHUI.toString()));
	}

	@Test
	void thePartyListsEachKakisRestrictions() throws Exception {
		given(kakis.party(ID, JIAHUI.toString())).willReturn(
				List.of(new PartyMember(JIAHUI, "Jia Hui", List.of("HALAL", "NUT_ALLERGY"))));

		mvc.perform(get("/api/kakis/party").param("ids", JIAHUI.toString()).with(signedIn()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].displayName").value("Jia Hui"))
				.andExpect(jsonPath("$[0].restrictions[0]").value("HALAL"));
	}

	@Test
	void aPartyWithSomeoneWhoIsNotYourKakiIsForbidden() throws Exception {
		String ids = JIAHUI + "," + UUID.randomUUID();
		given(kakis.party(ID, ids)).willThrow(new ForbiddenException("Those people aren't all your kakis"));

		mvc.perform(get("/api/kakis/party").param("ids", ids).with(signedIn()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.detail").value("Those people aren't all your kakis"));
	}

	private static RequestPostProcessor signedIn() {
		return jwt().jwt(token -> token.subject(ID.toString())).authorities(EffectiveRole.USER.authorities());
	}
}
