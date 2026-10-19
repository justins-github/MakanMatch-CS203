package com.makanmatch.context_service.DTO;

import java.util.List;

/** Result of the pure weather-based ranking calculation. */
public record ScoredPlace(NearbyPlaceDto place, double weatherScore, List<String> reasons) {
    public ScoredPlace {
        reasons = reasons == null ? List.of() : List.copyOf(reasons);
    }

    public NearbyPlaceDto toNearbyPlace() {
        return new NearbyPlaceDto(place.id(), place.name(), place.lat(), place.lng(),
                place.rawWalkMinutes(), place.adjustedWalkMinutes(), weatherScore, reasons,
                place.medianPrice(), place.priceBand(), place.priceSource(), place.priceReportCount());
    }
}
