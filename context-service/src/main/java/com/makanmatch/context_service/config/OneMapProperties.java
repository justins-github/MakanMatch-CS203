package com.makanmatch.context_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "onemap")
public record OneMapProperties(String baseUrl, String email, String password) {}

