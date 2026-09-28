package com.makanmatch.account_service.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;

/** Swagger UI at /swagger-ui.html; the Authorize button takes an access token. */
@Configuration
public class OpenApiConfig {

	@Bean
	OpenAPI accountServiceOpenApi() {
		return new OpenAPI()
				.info(new Info()
						.title("MakanMatch Account Service")
						.version("v1")
						.description("""
								Sign-up and login (Supabase Auth underneath), profiles, venue ownership claims \
								and admin user management. To try protected routes: call POST /api/auth/login, \
								copy accessToken from the response, press Authorize and paste it."""))
				.components(new Components().addSecuritySchemes("bearer", new SecurityScheme()
						.type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")));
	}
}
