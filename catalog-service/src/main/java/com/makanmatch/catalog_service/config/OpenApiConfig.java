package com.makanmatch.catalog_service.config;

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
	OpenAPI catalogServiceOpenApi() {
		return new OpenAPI()
				.info(new Info()
						.title("MakanMatch Catalog Service")
						.version("v1")
						.description("""
								The venue registry (Overture Maps + curated seeds), owner-reported venue status, \
								menus and price history. Reads are public; writes need an access token from the \
								account service (POST /api/auth/login there), pasted into Authorize."""))
				.components(new Components().addSecuritySchemes("bearer", new SecurityScheme()
						.type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")));
	}
}
