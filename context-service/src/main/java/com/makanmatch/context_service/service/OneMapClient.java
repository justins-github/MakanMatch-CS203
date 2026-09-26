package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.OneMapRouteResponse;
import com.makanmatch.context_service.DTO.WalkRouteDto;
import com.makanmatch.context_service.exception.OneMapException;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class OneMapClient {
    private final RestClient restClient;
    private final OneMapTokenManager tokenManager;

    public OneMapClient(RestClient restClient, OneMapTokenManager tokenManager) {
        this.restClient = restClient;
        this.tokenManager = tokenManager;
    }
    @Cacheable(value = "walkRoutes", key = "#startLat + ':' + #startLng + ':' + #endLat + ':' + #endLng + ':walk'")

    public WalkRouteDto getWalkRoute(double startLat, double startLng, double endLat, double endLng) {
        try {
            OneMapRouteResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/api/public/routingsvc/route")
                            .queryParam("start", startLat + "," + startLng)
                            .queryParam("end", endLat + "," + endLng)
                            .queryParam("routeType", "walk")
                            .build())
                    .header("Authorization", tokenManager.getValidToken())
                    .retrieve()
                    .body(OneMapRouteResponse.class);

            return new WalkRouteDto(
                    response.routeSummary().totalTime(),
                    response.routeSummary().totalDistance()
            );
        } catch (RestClientException e) {
            throw new OneMapException("OneMap route lookup failed for (%s,%s)->(%s,%s)"
                    .formatted(startLat, startLng, endLat, endLng), e);
        }
    }
}