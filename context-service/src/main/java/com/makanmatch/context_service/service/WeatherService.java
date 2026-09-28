package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.RainCategory;
import com.makanmatch.context_service.DTO.WeatherContext;
import com.makanmatch.context_service.client.NeaForecastResponse;
import com.makanmatch.context_service.client.NeaWeatherClient;
import com.makanmatch.context_service.config.WeatherProperties;
import com.makanmatch.context_service.exception.NeaException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

@Service
public class WeatherService {
    private static final Logger log = LoggerFactory.getLogger(WeatherService.class);

    private final NeaWeatherClient neaWeatherClient;
    private final WeatherProperties properties;

    public WeatherService(NeaWeatherClient neaWeatherClient, WeatherProperties properties) {
        this.neaWeatherClient = neaWeatherClient;
        this.properties = properties;
    }

    @Cacheable(cacheNames = "weather", key = "#lat + ':' + #lng")
    public WeatherContext getContext(double lat, double lng) {
        log.info("Loading NEA weather context for ({},{})", lat, lng);
        try {
            NeaForecastResponse.Data data = neaWeatherClient.getLatestForecast();
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
            log.warn("NEA weather unavailable; using unadjusted walking time: {}", e.getMessage());
            return unavailableContext();
        }
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
