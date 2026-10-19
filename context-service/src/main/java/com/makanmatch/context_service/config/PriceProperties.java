package com.makanmatch.context_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

@ConfigurationProperties(prefix = "price")
public record PriceProperties(BigDecimal bandLowMax, BigDecimal bandMidMax) {}
