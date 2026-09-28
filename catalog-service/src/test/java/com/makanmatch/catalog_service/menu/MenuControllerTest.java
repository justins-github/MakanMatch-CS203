package com.makanmatch.catalog_service.menu;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import com.makanmatch.catalog_service.menu.dto.DishResponse;
import com.makanmatch.catalog_service.security.Caller;

@WebMvcTest(MenuController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class })
class MenuControllerTest {

	private static final UUID USER = UUID.fromString("33333333-3333-3333-3333-333333333333");

	@Autowired
	MockMvc mvc;

	@MockitoBean
	MenuService menus;
	@MockitoBean
	JwtDecoder jwtDecoder;

	@Test
	void menusArePublic() throws Exception {
		given(menus.menu("turks-kebab")).willReturn(List.of(new DishResponse("d1", "turks-kebab", "Chicken doner wrap",
				ReportSource.SEED, false, null, null, null, false, null)));

		mvc.perform(get("/api/catalog/venues/turks-kebab/dishes"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].name").value("Chicken doner wrap"));
	}

	@Test
	void addingADishNeedsToSignIn() throws Exception {
		mvc.perform(post("/api/catalog/venues/turks-kebab/dishes")
				.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Lamb shish\"}"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void theCallersActAsChoiceIsPassedOn() throws Exception {
		Caller expected = new Caller(USER, "token-value", "user");
		given(menus.create(eq("turks-kebab"), any(), eq(expected))).willReturn(new DishResponse("d2", "turks-kebab",
				"Lamb shish", ReportSource.DINER, false, null, null, null, false, null));

		mvc.perform(post("/api/catalog/venues/turks-kebab/dishes")
				.with(jwt().jwt(token -> token.subject(USER.toString()).tokenValue("token-value")))
				.header("X-Act-As", "user")
				.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Lamb shish\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.source").value("DINER"));
	}

	@Test
	void editingThePriceListNeedsToSignIn() throws Exception {
		mvc.perform(patch("/api/catalog/venues/turks-kebab/dishes")
				.contentType(MediaType.APPLICATION_JSON).content("{\"removed\":[\"d1\"]}"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void aPriceListEditComesBackAsTheNewMenu() throws Exception {
		Caller expected = new Caller(USER, "token-value", null);
		given(menus.applyChanges(eq("turks-kebab"), any(), eq(expected))).willReturn(List.of(new DishResponse("d1",
				"turks-kebab", "Chicken doner wrap", ReportSource.OWNER, false, null, null, null, false, null)));

		mvc.perform(patch("/api/catalog/venues/turks-kebab/dishes")
				.with(jwt().jwt(token -> token.subject(USER.toString()).tokenValue("token-value")))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"prices\":[{\"dishId\":\"d1\",\"price\":9.5}],\"added\":[{\"name\":\"Teh tarik\"}]}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].source").value("OWNER"));
	}

	@Test
	void pricesInAPriceListEditMustBePositive() throws Exception {
		mvc.perform(patch("/api/catalog/venues/turks-kebab/dishes").with(jwt().jwt(token -> token.subject(USER.toString())))
				.contentType(MediaType.APPLICATION_JSON).content("{\"prices\":[{\"dishId\":\"d1\",\"price\":0}]}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors['prices[0].price']").value("must be at least $0.10"));
	}

	@Test
	void pricesMustBePositive() throws Exception {
		mvc.perform(post("/api/catalog/dishes/d1/prices").with(jwt().jwt(token -> token.subject(USER.toString())))
				.contentType(MediaType.APPLICATION_JSON).content("{\"price\":0}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.price").exists());
	}
}
