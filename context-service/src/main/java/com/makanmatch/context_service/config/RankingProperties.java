package com.makanmatch.context_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Set;

@ConfigurationProperties(prefix = "ranking")
public record RankingProperties(
        WalkWeight walkWeight,
        double shelterBonus,
        double comfortBonus,
        Set<String> shelteredPlaceIds,
        Set<String> comfortPlaceIds
) {
    public RankingProperties {
        if (walkWeight == null || shelteredPlaceIds == null || comfortPlaceIds == null) {
            throw new IllegalArgumentException("Ranking configuration is incomplete");
        }
    }

    public record WalkWeight(double none, double light, double heavy) {}
}
