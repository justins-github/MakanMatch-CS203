package com.makanmatch.catalog_service.menu;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.makanmatch.catalog_service.common.ApiExceptionHandler;
import com.makanmatch.catalog_service.config.SecurityConfig;
import com.makanmatch.catalog_service.menu.dto.MenuScanResponse;
import com.makanmatch.catalog_service.menu.dto.ScannedDish;
import com.makanmatch.catalog_service.security.Caller;

@WebMvcTest(MenuScanController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class })
class MenuScanControllerTest {

	private static final UUID USER = UUID.fromString("33333333-3333-3333-3333-333333333333");
	private static final MockMultipartFile PHOTO =
			new MockMultipartFile("photo", "menu.jpg", "image/jpeg", new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF });

	@Autowired
	MockMvc mvc;

	@MockitoBean
	MenuScanService scans;
	@MockitoBean
	JwtDecoder jwtDecoder;

	@Test
	void scanningAMenuNeedsToSignIn() throws Exception {
		mvc.perform(multipart("/api/catalog/venues/turks-kebab/menu-scans").file(PHOTO))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void ownersGetBackWhatThePhotoSays() throws Exception {
		Caller expected = new Caller(USER, "token-value", null);
		given(scans.scan(eq("turks-kebab"), any(), eq(expected))).willReturn(new MenuScanResponse(true,
				List.of(new ScannedDish("Teh tarik", new BigDecimal("1.80"), null))));

		mvc.perform(multipart("/api/catalog/venues/turks-kebab/menu-scans").file(PHOTO)
				.with(jwt().jwt(token -> token.subject(USER.toString()).tokenValue("token-value"))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sample").value(true))
				.andExpect(jsonPath("$.dishes[0].name").value("Teh tarik"));
	}

	@Test
	void aScanNeedsAPhoto() throws Exception {
		mvc.perform(multipart("/api/catalog/venues/turks-kebab/menu-scans")
				.with(jwt().jwt(token -> token.subject(USER.toString()))))
				.andExpect(status().isBadRequest());
	}
}
