package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.NearbyPlaceDto;
import com.makanmatch.context_service.DTO.RainCategory;
import com.makanmatch.context_service.DTO.ScoredPlace;
import com.makanmatch.context_service.DTO.WeatherContext;
import com.makanmatch.context_service.config.RankingProperties;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Pure weather-based ranking; it performs no network, persistence, or other I/O. */
@Service
public class RankingService {
    private final RankingProperties properties;

    public RankingService(RankingProperties properties) {
        this.properties = properties;
    }

    public ScoredPlace score(NearbyPlaceDto place, WeatherContext weather, double maxWalkMin) {
        RainCategory category = weather == null ? null : weather.rainCategory();
        boolean unavailable = weather != null && "unavailable".equalsIgnoreCase(weather.status());
        if (unavailable) {
            category = RainCategory.NONE;
        }

        double walkFactor = maxWalkMin <= 0 ? 0.0
                : 1.0 - (place.adjustedWalkMinutes() / maxWalkMin);
        double weight = weightFor(category);
        double shelterBonus = category != null && category != RainCategory.NONE
                && properties.shelteredPlaceIds().contains(place.id()) ? properties.shelterBonus() : 0.0;
        double comfortBonus = category != null && category != RainCategory.NONE
                && properties.comfortPlaceIds().contains(place.id()) ? properties.comfortBonus() : 0.0;
        double score = clamp(0.5 + weight * (walkFactor - 0.5) + shelterBonus + comfortBonus);

        List<String> reasons = new ArrayList<>();
        if (unavailable) {
            reasons.add("Weather data unavailable");
        } else if (category != null && category != RainCategory.NONE) {
            if (shelterBonus > 0) {
                reasons.add("Sheltered for rain");
            }
            if (comfortBonus > 0) {
                reasons.add("More comfortable in rain");
            }
        }
        return new ScoredPlace(place, score, reasons);
    }

    public List<NearbyPlaceDto> rank(List<NearbyPlaceDto> places, WeatherContext weather, double maxWalkMin) {
        return places.stream()
                .map(place -> score(place, weather, maxWalkMin))
                .sorted(Comparator.comparingDouble(ScoredPlace::weatherScore).reversed()
                        .thenComparingDouble(scored -> scored.place().adjustedWalkMinutes()))
                .map(ScoredPlace::toNearbyPlace)
                .toList();
    }

    private double weightFor(RainCategory category) {
        if (category == null) return 0.0;
        return switch (category) {
            case NONE -> properties.walkWeight().none();
            case LIGHT -> properties.walkWeight().light();
            case HEAVY -> properties.walkWeight().heavy();
        };
    }

    private static double clamp(double value) {
        return Math.max(0.0, Math.min(1.0, value));
    }
}
