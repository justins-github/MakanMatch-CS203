package com.makanmatch.context_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "catalog")
public record CatalogServiceProperties(String baseUrl) {
    public CatalogServiceProperties {
        if (baseUrl == null || baseUrl.isBlank()) baseUrl = "http://localhost:8083";
    }
}
