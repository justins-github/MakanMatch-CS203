package com.makanmatch.context_service.DTO;

import java.util.Locale;

public enum RainCategory {
    NONE,
    LIGHT,
    HEAVY;

    public static RainCategory classify(String forecastText) {
        if (forecastText == null || forecastText.isBlank()) {
            return NONE;
        }
        String normalized = forecastText.toLowerCase(Locale.ROOT);
        if (normalized.contains("thunder")) {
            return HEAVY;
        }
        if (normalized.contains("rain") || normalized.contains("shower")) {
            return LIGHT;
        }
        return NONE;
    }
}
