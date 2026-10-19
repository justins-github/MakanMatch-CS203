package com.makanmatch.context_service.DTO;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record NearbyResponse(String routingStatus, List<NearbyPlaceDto> places, NearbyWeatherDto weather,
                             @Schema(description = "Venue cache coverage", allowableValues = {"full", "partial", "unavailable"})
                             String venueCoverage,
                             @Schema(description = "Number of venues read from the provider cache") int venuesSearched) {
    public NearbyResponse(String routingStatus, List<NearbyPlaceDto> places, NearbyWeatherDto weather) {
        this(routingStatus, places, weather, places.isEmpty() ? "unavailable" : "full", places.size());
    }

    public NearbyResponse {
        places = List.copyOf(places);
    }
}
