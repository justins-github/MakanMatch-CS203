package com.makanmatch.catalog_service.venue;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.DayOfWeek;
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

import com.makanmatch.catalog_service.common.ApiExceptionHandler;
import com.makanmatch.catalog_service.config.SecurityConfig;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.venue.dto.DayHours;
import com.makanmatch.catalog_service.venue.dto.OpeningHoursResponse;
import com.makanmatch.catalog_service.venue.dto.TimeRange;

@WebMvcTest(OpeningHoursController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class })
class OpeningHoursControllerTest {

	private static final UUID USER = UUID.fromString("33333333-3333-3333-3333-333333333333");
	private static final String MONDAY_LUNCH = """
			{"week":[{"day":"MONDAY","sessions":[{"opens":"11:00","closes":"14:30"}]}]}""";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	OpeningHoursService hours;
	@MockitoBean
	JwtDecoder jwtDecoder;

	@Test
	void hoursArePublic() throws Exception {
		given(hours.get("moona-thai")).willReturn(new OpeningHoursResponse("moona-thai",
				List.of(new DayHours(DayOfWeek.MONDAY, List.of(new TimeRange("11:00", "14:30")))), null));

		mvc.perform(get("/api/catalog/venues/moona-thai/hours"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.week[0].day").value("MONDAY"))
				.andExpect(jsonPath("$.week[0].sessions[0].closes").value("14:30"));
	}

	@Test
	void everyVenuesHoursArePublic() throws Exception {
		given(hours.all()).willReturn(List.of(new OpeningHoursResponse("moona-thai", List.of(), null)));
		mvc.perform(get("/api/catalog/venue-hours"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].venueId").value("moona-thai"));
	}

	@Test
	void settingHoursNeedsToSignIn() throws Exception {
		mvc.perform(put("/api/catalog/venues/moona-thai/hours")
				.contentType(MediaType.APPLICATION_JSON).content(MONDAY_LUNCH))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void ownersSetHoursAsThemselves() throws Exception {
		Caller expected = new Caller(USER, "token-value", null);
		given(hours.replace(eq("moona-thai"), any(), eq(expected)))
				.willReturn(new OpeningHoursResponse("moona-thai", List.of(), null));

		mvc.perform(put("/api/catalog/venues/moona-thai/hours")
				.with(jwt().jwt(token -> token.subject(USER.toString()).tokenValue("token-value")))
				.contentType(MediaType.APPLICATION_JSON).content(MONDAY_LUNCH))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venueId").value("moona-thai"));
	}

	@Test
	void timesMustBe24HourClockTimes() throws Exception {
		mvc.perform(put("/api/catalog/venues/moona-thai/hours")
				.with(jwt().jwt(token -> token.subject(USER.toString())))
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"week":[{"day":"MONDAY","sessions":[{"opens":"11am","closes":"24:00"}]}]}"""))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors['week[0].sessions[0].opens']").value("must be a time like 09:30"));
	}
}
