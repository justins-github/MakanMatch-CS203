package com.makanmatch.context_service.DTO;

public record WeatherContext(
        RainCategory rainCategory,
        String forecastText,
        String area,
        double multiplier,
        String status
) {}
