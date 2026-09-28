package com.makanmatch.context_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "weather")
public record WeatherProperties(RainMultiplier rainMultiplier) {
    public WeatherProperties {
        if (rainMultiplier == null || !isPositiveFinite(rainMultiplier.light())
                || !isPositiveFinite(rainMultiplier.heavy())) {
            throw new IllegalArgumentException("Weather rain multipliers must be positive finite numbers");
        }
    }

    public String assumptionText() {
        return "Rain multipliers are configurable assumptions: light=" + rainMultiplier.light()
                + "x, heavy=" + rainMultiplier.heavy() + "x.";
    }

    private static boolean isPositiveFinite(double value) {
        return Double.isFinite(value) && value > 0;
    }

    public record RainMultiplier(double light, double heavy) {}
}
