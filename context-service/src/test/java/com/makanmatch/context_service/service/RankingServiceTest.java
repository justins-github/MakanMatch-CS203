package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.NearbyPlaceDto;
import com.makanmatch.context_service.DTO.RainCategory;
import com.makanmatch.context_service.DTO.ScoredPlace;
import com.makanmatch.context_service.DTO.WeatherContext;
import com.makanmatch.context_service.config.RankingProperties;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class RankingServiceTest {
    private final RankingService ranking = new RankingService(new RankingProperties(
            new RankingProperties.WalkWeight(0.2, 0.5, 0.7), 0.20, 0.10,
            Set.of("sheltered", "both"), Set.of("comfortable", "both")));

    @Test
    void tableOfWeatherShelterAndDistanceCasesProducesBoundedScoresAndReasons() {
        for (RainCategory category : RainCategory.values()) {
            for (String placeId : List.of("plain", "sheltered", "comfortable", "both")) {
                for (double adjustedMinutes : List.of(5.0, 14.0)) {
                    ScoredPlace scored = ranking.score(
                            new NearbyPlaceDto(placeId, placeId, 1.3, 103.8, adjustedMinutes, adjustedMinutes),
                            new WeatherContext(category, category.name(), "City", 1.0, "available"), 15);

                    assertThat(scored.weatherScore()).isBetween(0.0, 1.0);
                    if (category != RainCategory.NONE && !placeId.equals("plain")) {
                        assertThat(scored.reasons()).isNotEmpty();
                    }
                }
            }
        }
    }

    @Test
    void shelteredTenMinutePlaceBeatsUnshelteredFiveMinutePlaceInHeavyRainButNotDryWeather() {
        NearbyPlaceDto sheltered = new NearbyPlaceDto("both", "Sheltered", 1.3, 103.8, 10, 10);
        NearbyPlaceDto unsheltered = new NearbyPlaceDto("plain", "Unsheltered", 1.3, 103.8, 5, 5);

        List<NearbyPlaceDto> heavy = ranking.rank(List.of(sheltered, unsheltered),
                new WeatherContext(RainCategory.HEAVY, "Thundery Showers", "City", 1.0, "available"), 15);
        List<NearbyPlaceDto> dry = ranking.rank(List.of(sheltered, unsheltered),
                new WeatherContext(RainCategory.NONE, "Cloudy", "City", 1.0, "available"), 15);

        assertThat(heavy).extracting(NearbyPlaceDto::id).containsExactly("both", "plain");
        assertThat(dry).extracting(NearbyPlaceDto::id).containsExactly("plain", "both");
    }

    @Test
    void unavailableWeatherHasNoBonusesAndExplainsFallback() {
        ScoredPlace scored = ranking.score(
                new NearbyPlaceDto("both", "Sheltered", 1.3, 103.8, 5, 5),
                new WeatherContext(RainCategory.NONE, null, null, 1.0, "unavailable"), 15);

        assertThat(scored.reasons()).containsExactly("Weather data unavailable");
        assertThat(scored.weatherScore()).isEqualTo(0.5 + 0.2 * (1.0 - (5.0 / 15.0) - 0.5));
    }
}
