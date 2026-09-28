package com.makanmatch.context_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "places")
public record PlacesProperties(int maxRouted) {}
