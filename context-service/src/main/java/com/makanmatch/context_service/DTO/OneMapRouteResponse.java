package com.makanmatch.context_service.DTO;

import com.fasterxml.jackson.annotation.JsonProperty;

public record OneMapRouteResponse(
        @JsonProperty("route_geometry") String routeGeometry,
        @JsonProperty("route_summary") RouteSummary routeSummary
) {
    public record RouteSummary(
            @JsonProperty("total_time") long totalTime,
            @JsonProperty("total_distance") long totalDistance
    ) {}
}
