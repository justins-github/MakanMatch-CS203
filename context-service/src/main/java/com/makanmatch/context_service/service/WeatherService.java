package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.RainCategory;
import com.makanmatch.context_service.DTO.WeatherContext;
import com.makanmatch.context_service.client.NeaForecastResponse;
import com.makanmatch.context_service.client.NeaWeatherClient;
import com.makanmatch.context_service.config.WeatherProperties;
import com.makanmatch.context_service.exception.NeaException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

@Service
public class WeatherService {
    private static final Logger log = LoggerFactory.getLogger(WeatherService.class);
    private static final String LATEST_FORECAST = "latest";

    private final NeaWeatherClient neaWeatherClient;
    private final WeatherProperties properties;
    private final Cache forecasts;

    public WeatherService(NeaWeatherClient neaWeatherClient, WeatherProperties properties, CacheManager cacheManager) {
        this.neaWeatherClient = neaWeatherClient;
        this.properties = properties;
        this.forecasts = cacheManager.getCache("weather");
    }

    public WeatherContext getContext(double lat, double lng) {
        try {
            NeaForecastResponse.Data data = latestForecast(lat, lng);
            NeaForecastResponse.AreaMetadata nearest = nearestArea(data.areaMetadata(), lat, lng);
            String forecastText = data.items().get(0).forecasts().stream()
                    .filter(forecast -> nearest.name().equalsIgnoreCase(forecast.area()))
                    .map(NeaForecastResponse.Forecast::forecast)
                    .findFirst()
                    .orElseThrow(() -> new NeaException("NEA forecast missing nearest area"));
            RainCategory category = RainCategory.classify(forecastText);
            double multiplier = switch (category) {
                case NONE -> 1.0;
                case LIGHT -> properties.rainMultiplier().light();
                case HEAVY -> properties.rainMultiplier().heavy();
            };
            return new WeatherContext(category, forecastText, nearest.name(), multiplier, "available");
        } catch (RuntimeException e) {
            Throwable cause = e instanceof Cache.ValueRetrievalException && e.getCause() != null ? e.getCause() : e;
            log.warn("NEA weather unavailable; using unadjusted walking time: {}", cause.getMessage());
            return unavailableContext();
        }
    }

    /**
     * One NEA response holds the forecast for every area, so it is cached once
     * (for 5 minutes, see CacheConfig) and shared by every location. Caching per
     * exact coordinate missed for almost every user, since GPS positions differ.
     * A failed fetch is not cached, so the next request tries NEA again.
     */
    private NeaForecastResponse.Data latestForecast(double lat, double lng) {
        return forecasts.get(LATEST_FORECAST, () -> {
            log.info("Loading NEA weather context for ({},{})", lat, lng);
            return neaWeatherClient.getLatestForecast();
        });
    }

    public String assumptionText() {
        return properties.assumptionText();
    }

    private static NeaForecastResponse.AreaMetadata nearestArea(
            List<NeaForecastResponse.AreaMetadata> areas, double lat, double lng) {
        if (areas == null || areas.isEmpty()) {
            throw new NeaException("NEA response contains no forecast areas");
        }
        return areas.stream()
                .filter(area -> area.labelLocation() != null)
                .min(Comparator.comparingDouble(area -> HaversineCalculator.distanceMetres(
                        lat, lng, area.labelLocation().latitude(), area.labelLocation().longitude())))
                .orElseThrow(() -> new NeaException("NEA response contains no area locations"));
    }

    private static WeatherContext unavailableContext() {
        return new WeatherContext(RainCategory.NONE, null, null, 1.0, "unavailable");
    }
}
