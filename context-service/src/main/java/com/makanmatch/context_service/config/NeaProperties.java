package com.makanmatch.context_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "nea")
public record NeaProperties(String baseUrl, String apiKey) {}
