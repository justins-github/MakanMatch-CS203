package com.makanmatch.context_service.DTO;

import java.util.List;

public record NearbyResponse(String routingStatus, List<NearbyPlaceDto> places, NearbyWeatherDto weather) {
    public NearbyResponse {
        places = List.copyOf(places);
    }
}
