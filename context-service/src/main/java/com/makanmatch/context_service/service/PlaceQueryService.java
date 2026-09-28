package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.WalkRouteDto;
import com.makanmatch.context_service.config.OneMapProperties;
import com.makanmatch.context_service.config.PlacesProperties;
import com.makanmatch.context_service.DTO.NearbyPlaceDto;
import com.makanmatch.context_service.DTO.NearbyResponse;
import com.makanmatch.context_service.DTO.PlaceDto;
import com.makanmatch.context_service.exception.OneMapException;
import com.makanmatch.context_service.provider.PlaceProvider;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.ArrayList;

@Service
public class PlaceQueryService {
    private final PlaceProvider placeProvider;
    private final OneMapClient oneMapClient;
    private final OneMapProperties oneMapProperties;
    private final PlacesProperties placesProperties;

    public PlaceQueryService(PlaceProvider placeProvider, OneMapClient oneMapClient,
                             OneMapProperties oneMapProperties, PlacesProperties placesProperties) {
        this.placeProvider = placeProvider;
        this.oneMapClient = oneMapClient;
        this.oneMapProperties = oneMapProperties;
        this.placesProperties = placesProperties;
    }

    /**
     * Routes only the nearest configured number of candidates. Places beyond that cap are not
     * checked against their real walking time and therefore cannot appear in this response.
     */
    public NearbyResponse findNearby(double lat, double lng, int maxWalkMin) {
        double radiusMetres = maxWalkMin * oneMapProperties.walkSpeedMPerMin();
        List<PlaceDto> candidates = placeProvider.getPlaces().stream()
                .map(place -> new Candidate(place, HaversineCalculator.distanceMetres(
                        lat, lng, place.lat(), place.lng())))
                .filter(candidate -> candidate.distanceMetres() <= radiusMetres)
                .sorted(Comparator.comparingDouble(Candidate::distanceMetres))
                .limit(Math.max(0, placesProperties.maxRouted()))
                .map(Candidate::place)
                .toList();

        List<NearbyPlaceDto> nearby = new ArrayList<>();
        boolean partial = false;
        for (PlaceDto place : candidates) {
            try {
                WalkRouteDto route = oneMapClient.getWalkRoute(lat, lng, place.lat(), place.lng());
                if (route.totalTimeSeconds() <= maxWalkMin * 60L) {
                    nearby.add(new NearbyPlaceDto(place.id(), place.name(), place.lat(), place.lng(),
                            route.totalTimeSeconds() / 60.0));
                }
            } catch (OneMapException e) {
                partial = true;
            }
        }
        nearby.sort(Comparator.comparingDouble(place -> place.walkMinutes()));
        return new NearbyResponse(partial ? "partial" : "complete", nearby);
    }

    private record Candidate(PlaceDto place, double distanceMetres) {}
}
