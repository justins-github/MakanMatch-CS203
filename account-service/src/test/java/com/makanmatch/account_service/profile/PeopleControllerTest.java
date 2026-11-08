package com.makanmatch.account_service.profile;

import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.makanmatch.account_service.common.ApiExceptionHandler;
import com.makanmatch.account_service.common.BadRequestException;
import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.config.SecurityConfig;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.dto.PersonCard;
import com.makanmatch.account_service.security.ActAsResolver;

/** /api/people through real HTTP routing and SecurityConfig; the rules themselves are in ProfileServicePeopleTest. */
@WebMvcTest(controllers = PeopleController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class })
class PeopleControllerTest {

	private static final UUID ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
	private static final UUID HAFIZ = UUID.fromString("22222222-2222-2222-2222-222222222222");

	@Autowired
	MockMvc mvc;

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
		mvc.perform(get("/api/people").param("ids", HAFIZ.toString())).andExpect(status().isUnauthorized());
	}

	@Test
	void givesOnlyAPersonsPublicCard() throws Exception {
		given(profiles.people(HAFIZ.toString())).willReturn(List.of(new PersonCard(HAFIZ, "Hafiz", "hafiz_nospice")));

		mvc.perform(get("/api/people").param("ids", HAFIZ.toString()).with(signedIn()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].id").value(HAFIZ.toString()))
				.andExpect(jsonPath("$[0].displayName").value("Hafiz"))
				.andExpect(jsonPath("$[0].username").value("hafiz_nospice"))
				.andExpect(jsonPath("$[0].length()").value(3))
				.andExpect(jsonPath("$[0].email").doesNotExist())
				.andExpect(jsonPath("$[0].dietary").doesNotExist())
				.andExpect(jsonPath("$[0].admin").doesNotExist())
				.andExpect(jsonPath("$[0].ownedVenues").doesNotExist());
	}

	@Test
	void aBadListOfIdsIsABadRequest() throws Exception {
		given(profiles.people("nope")).willThrow(new BadRequestException("ids must be comma-separated account ids"));

		mvc.perform(get("/api/people").param("ids", "nope").with(signedIn())).andExpect(status().isBadRequest());
	}

	private static RequestPostProcessor signedIn() {
		return jwt().jwt(token -> token.subject(ID.toString())).authorities(EffectiveRole.USER.authorities());
	}
}
