package com.makanmatch.catalog_service.changes;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.makanmatch.catalog_service.common.ApiExceptionHandler;
import com.makanmatch.catalog_service.config.SecurityConfig;
import com.makanmatch.catalog_service.menu.dto.MenuChangesSince.RepricedDish;

@WebMvcTest(VenueChangesController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class })
class VenueChangesControllerTest {

	private static final Instant VISIT = Instant.parse("2026-10-10T00:00:00Z");

	@Autowired
	MockMvc mvc;

	@MockitoBean
	VenueChangesService changes;
	@MockitoBean
	JwtDecoder jwtDecoder;

	@Test
	void changesSinceAVisitArePublic() throws Exception {
		given(changes.since("turks-kebab", VISIT)).willReturn(new VenueChangesResponse(VISIT,
				List.of(new RepricedDish("d1", "Chicken doner wrap", new BigDecimal("8.50"), new BigDecimal("10.50"), VISIT)),
				List.of(), List.of(), List.of(), new BigDecimal("8.50"), new BigDecimal("10.50")));

		mvc.perform(get("/api/catalog/venues/turks-kebab/changes").param("since", "2026-10-10T00:00:00Z"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.prices[0].name").value("Chicken doner wrap"))
				.andExpect(jsonPath("$.prices[0].to").value(10.50))
				.andExpect(jsonPath("$.priceNow").value(10.50));
	}

	@Test
	void aSinceTimeIsRequiredAndMustBeATimestamp() throws Exception {
		mvc.perform(get("/api/catalog/venues/turks-kebab/changes")).andExpect(status().isBadRequest());
		mvc.perform(get("/api/catalog/venues/turks-kebab/changes").param("since", "last tuesday"))
				.andExpect(status().isBadRequest());
	}
}
