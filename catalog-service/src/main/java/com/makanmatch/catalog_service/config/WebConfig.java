package com.makanmatch.catalog_service.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.makanmatch.catalog_service.security.AccountClient;
import com.makanmatch.catalog_service.security.AccountLookupInterceptor;

@Configuration
public class WebConfig implements WebMvcConfigurer {

	private final AccountClient accounts;

	public WebConfig(AccountClient accounts) {
		this.accounts = accounts;
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(new AccountLookupInterceptor(accounts)).addPathPatterns("/api/catalog/**");
	}
}
