package com.makanmatch.catalog_service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Boots the whole service against a real database: Flyway runs the migrations
 * and Hibernate validates every entity against them. Needs DB_* and SUPABASE_*
 * environment variables (e.g. for the Supabase test project), so it is skipped
 * in a plain `mvnw test`.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "DB_HOST", matches = ".+")
class CatalogServiceApplicationTests {

	@Test
	void contextLoads() {
	}

}
