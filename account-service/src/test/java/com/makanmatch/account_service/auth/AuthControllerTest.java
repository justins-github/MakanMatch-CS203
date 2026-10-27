package com.makanmatch.account_service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.makanmatch.account_service.auth.AuthService.AuthResult;
import com.makanmatch.account_service.auth.dto.SignupRequest;
import com.makanmatch.account_service.common.ApiExceptionHandler;
import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.common.UnauthorizedException;
import com.makanmatch.account_service.config.SecurityConfig;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.DietaryNeeds;
import com.makanmatch.account_service.profile.DietaryNeeds.Preference;
import com.makanmatch.account_service.profile.DietaryNeeds.Restriction;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.profile.dto.MeResponse;
import com.makanmatch.account_service.security.ActAsResolver;
import com.makanmatch.account_service.security.LoginRateLimiter;
import com.makanmatch.account_service.supabase.SupabaseSession;
import com.makanmatch.account_service.supabase.SupabaseUser;

import jakarta.servlet.http.Cookie;

@WebMvcTest(controllers = AuthController.class, properties = "auth.login-attempts-per-window=3")
@Import({ SecurityConfig.class, ApiExceptionHandler.class, RefreshCookie.class, LoginRateLimiter.class })
class AuthControllerTest {

	private static final UUID ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
	private static String login(String identifier) {
		return "{\"identifier\":\"" + identifier + "\",\"password\":\"hunter22x\"}";
	}

	@Autowired
	MockMvc mvc;

	@MockitoBean
	AuthService auth;
	@MockitoBean
	ProfileService profiles;
	@MockitoBean
	OwnershipService ownership;
	@MockitoBean
	ActAsResolver actAs;
	@MockitoBean
	JwtDecoder jwtDecoder;

	@Test
	void loginReturnsTheAccessTokenAndHidesTheRefreshTokenInAnHttpOnlyCookie() throws Exception {
		givenLoginSucceeds();

		mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login("happy")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.accessToken").value("access-1"))
				.andExpect(jsonPath("$.refreshToken").doesNotExist())
				.andExpect(jsonPath("$.me.displayName").value("Diner"))
				.andExpect(header().string(HttpHeaders.SET_COOKIE, allOf(
						containsString("mm_refresh=refresh-1"),
						containsString("HttpOnly"),
						containsString("SameSite=Strict"),
						containsString("Path=/api/auth"))));
	}

	@Test
	void refreshNeedsTheAntiForgeryHeader() throws Exception {
		mvc.perform(post("/api/auth/refresh").cookie(new Cookie(RefreshCookie.NAME, "refresh-1")))
				.andExpect(status().isForbidden());
	}

	@Test
	void refreshWithoutACookieIsUnauthorizedAndClearsTheCookie() throws Exception {
		mvc.perform(post("/api/auth/refresh").header(AuthController.CSRF_HEADER, "makanmatch"))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));
	}

	@Test
	void refreshRotatesTheCookie() throws Exception {
		given(auth.refresh("refresh-1")).willReturn(session("access-2", "refresh-2"));
		given(profiles.me(ID, "diner@example.com", null)).willReturn(me());

		mvc.perform(post("/api/auth/refresh").header(AuthController.CSRF_HEADER, "makanmatch")
				.cookie(new Cookie(RefreshCookie.NAME, "refresh-1")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.accessToken").value("access-2"))
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("mm_refresh=refresh-2")));
	}

	@Test
	void failedLoginsGetOneGenericMessage() throws Exception {
		given(auth.login(any())).willThrow(new UnauthorizedException("Wrong email/username or password"));

		mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login("wrong")))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.detail").value("Wrong email/username or password"));
	}

	@Test
	void repeatedLoginAttemptsAreThrottled() throws Exception {
		given(auth.login(any())).willThrow(new UnauthorizedException("Wrong email/username or password"));
		for (int i = 0; i < 3; i++) {
			mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login("spammer")))
					.andExpect(status().isUnauthorized());
		}
		mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login("spammer")))
				.andExpect(status().isTooManyRequests());
	}

	@Test
	void weakPasswordsAreRejectedAtSignup() throws Exception {
		mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"a@example.com\",\"password\":\"password\",\"displayName\":\"A\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.password").exists());
	}

	@Test
	void signupHandsTheDietaryNeedsToTheService() throws Exception {
		given(auth.signup(any())).willReturn(new AuthResult(session("access-1", "refresh-1"), ID));
		given(profiles.me(ID, "diner@example.com", null)).willReturn(me());

		mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"a@example.com\",\"password\":\"hunter22x\",\"displayName\":\"A\","
						+ "\"dietary\":{\"restrictions\":[\"VEGAN\"],\"preferences\":[\"LESS_SWEET\"]}}"))
				.andExpect(status().isCreated());

		ArgumentCaptor<SignupRequest> sent = ArgumentCaptor.forClass(SignupRequest.class);
		verify(auth).signup(sent.capture());
		assertThat(sent.getValue().dietary()).isEqualTo(
				new DietaryNeeds(Set.of(Restriction.VEGAN), Set.of(Preference.LESS_SWEET), null));
	}

	@Test
	void logoutEndsTheSessionAndClearsTheCookieEvenWithAnExpiredAccessToken() throws Exception {
		// The stale Authorization header must not get in the way of signing out.
		mvc.perform(post("/api/auth/logout").header(AuthController.CSRF_HEADER, "makanmatch")
				.header(HttpHeaders.AUTHORIZATION, "Bearer expired-token")
				.cookie(new Cookie(RefreshCookie.NAME, "refresh-1")))
				.andExpect(status().isNoContent())
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));
		verify(auth).logout("refresh-1");
	}

	private void givenLoginSucceeds() {
		given(auth.login(any())).willReturn(new AuthResult(session("access-1", "refresh-1"), ID));
		given(profiles.me(ID, "diner@example.com", null)).willReturn(me());
	}

	private static SupabaseSession session(String access, String refresh) {
		SupabaseUser user = new SupabaseUser(ID, "diner@example.com", Map.of("display_name", "Diner"), null, null, null);
		return new SupabaseSession(access, refresh, 3600, 1_900_000_000L, user);
	}

	private static MeResponse me() {
		return new MeResponse(ID, "diner@example.com", "Diner", "diner", new DietaryNeeds(Set.of(), Set.of(), null),
				false, EffectiveRole.USER, List.of(), Instant.EPOCH);
	}
}
