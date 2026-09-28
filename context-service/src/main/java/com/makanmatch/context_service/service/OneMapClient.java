package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.OneMapRouteResponse;
import com.makanmatch.context_service.DTO.WalkRouteDto;
import com.makanmatch.context_service.exception.OneMapException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class OneMapClient {

    private static final Logger log = LoggerFactory.getLogger(OneMapClient.class);

    private final RestClient restClient;
    private final OneMapTokenManager tokenManager;

    public OneMapClient(RestClient restClient, OneMapTokenManager tokenManager) {
        this.restClient = restClient;
        this.tokenManager = tokenManager;
    }

    @Cacheable(value = "walkRoutes", key = "#startLat + ':' + #startLng + ':' + #endLat + ':' + #endLng + ':walk'")
    public WalkRouteDto getWalkRoute(double startLat, double startLng, double endLat, double endLng) {
        return fetchWalkRoute(startLat, startLng, endLat, endLng, true);
    }

    private WalkRouteDto fetchWalkRoute(double startLat, double startLng, double endLat, double endLng, boolean retryOnAuthFailure) {
        log.info("Fetching walk route from OneMap for ({},{}) -> ({},{})", startLat, startLng, endLat, endLng);
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

            if (response == null || response.routeSummary() == null) {
                throw new OneMapException("OneMap route response missing route_summary for (%s,%s)->(%s,%s)"
                        .formatted(startLat, startLng, endLat, endLng));
            }

            return new WalkRouteDto(
                    response.routeSummary().totalTime(),
                    response.routeSummary().totalDistance()
            );
        } catch (HttpClientErrorException.Unauthorized e) {
            if (retryOnAuthFailure) {
                log.warn("OneMap route returned 401; refreshing token and retrying once");
                tokenManager.invalidateToken();
                return fetchWalkRoute(startLat, startLng, endLat, endLng, false);
            }
            throw new OneMapException("OneMap route lookup unauthorized for (%s,%s)->(%s,%s)"
                    .formatted(startLat, startLng, endLat, endLng), e);
        } catch (HttpClientErrorException e) {
            throw new OneMapException("OneMap route lookup failed with HTTP %s for (%s,%s)->(%s,%s)"
                    .formatted(e.getStatusCode(), startLat, startLng, endLat, endLng), e);
        } catch (RestClientException e) {
            throw new OneMapException("OneMap route lookup failed for (%s,%s)->(%s,%s)"
                    .formatted(startLat, startLng, endLat, endLng), e);
        }
    }
}
