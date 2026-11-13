package com.makanmatch.catalog_service.contributions;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.makanmatch.catalog_service.common.ApiExceptionHandler;
import com.makanmatch.catalog_service.config.SecurityConfig;
import com.makanmatch.catalog_service.security.AccountClient;

@WebMvcTest(ContributionsController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class })
class ContributionsControllerTest {

	private static final UUID USER = UUID.fromString("44444444-4444-4444-4444-444444444444");

	@Autowired
	MockMvc mvc;

	@MockitoBean
	ContributionsService contributions;
	@MockitoBean
	AccountClient accounts;
	@MockitoBean
	JwtDecoder jwtDecoder;

	@Test
	void forgetsTheCallersOwnContributions() throws Exception {
		mvc.perform(delete("/api/catalog/me/contributions").with(jwt().jwt(token -> token.subject(USER.toString()))))
				.andExpect(status().isNoContent());

		verify(contributions).forget(USER);
	}

	@Test
	void needsASignedInCaller() throws Exception {
		mvc.perform(delete("/api/catalog/me/contributions")).andExpect(status().isUnauthorized());

		verify(contributions, never()).forget(any());
	}
}
