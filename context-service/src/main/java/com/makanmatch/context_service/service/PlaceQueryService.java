package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.WalkRouteDto;
import com.makanmatch.context_service.config.OneMapProperties;
import com.makanmatch.context_service.config.PlacesProperties;
import com.makanmatch.context_service.config.RankingProperties;
import com.makanmatch.context_service.DTO.NearbyPlaceDto;
import com.makanmatch.context_service.DTO.NearbyResponse;
import com.makanmatch.context_service.DTO.NearbyWeatherDto;
import com.makanmatch.context_service.DTO.PlaceDto;
import com.makanmatch.context_service.DTO.PriceSource;
import com.makanmatch.context_service.DTO.WeatherContext;
import com.makanmatch.context_service.exception.OneMapException;
import com.makanmatch.context_service.provider.PlaceProvider;
import com.makanmatch.context_service.provider.PriceProvider;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Comparator;
import java.util.List;
import java.util.ArrayList;

@Service
public class PlaceQueryService {
    private final PlaceProvider placeProvider;
    private final OneMapClient oneMapClient;
    private final OneMapProperties oneMapProperties;
    private final PlacesProperties placesProperties;
    private final WeatherService weatherService;
    private final RankingService rankingService;
    private final PriceProvider priceProvider;
    private final PriceBandService priceBandService;

    @Autowired
    public PlaceQueryService(PlaceProvider placeProvider, OneMapClient oneMapClient,
                             OneMapProperties oneMapProperties, PlacesProperties placesProperties,
                             WeatherService weatherService, RankingService rankingService,
                             PriceProvider priceProvider, PriceBandService priceBandService) {
        this.placeProvider = placeProvider;
        this.oneMapClient = oneMapClient;
        this.oneMapProperties = oneMapProperties;
        this.placesProperties = placesProperties;
        this.weatherService = weatherService;
        this.rankingService = rankingService;
        this.priceProvider = priceProvider;
        this.priceBandService = priceBandService;
    }

    public PlaceQueryService(PlaceProvider placeProvider, OneMapClient oneMapClient,
                             OneMapProperties oneMapProperties, PlacesProperties placesProperties,
                             WeatherService weatherService) {
        this(placeProvider, oneMapClient, oneMapProperties, placesProperties, weatherService,
                new RankingService(new RankingProperties(
                        new RankingProperties.WalkWeight(0.2, 0.5, 0.7), 0.20, 0.10,
                        java.util.Set.of(), java.util.Set.of())),
                venueId -> java.util.List.of(), new PriceBandService(new com.makanmatch.context_service.config.PriceProperties(
                        java.math.BigDecimal.TEN, java.math.BigDecimal.valueOf(30))));
    }

    public PlaceQueryService(PlaceProvider placeProvider, OneMapClient oneMapClient,
                             OneMapProperties oneMapProperties, PlacesProperties placesProperties,
                             WeatherService weatherService, PriceProvider priceProvider,
                             PriceBandService priceBandService) {
        this(placeProvider, oneMapClient, oneMapProperties, placesProperties, weatherService,
                new RankingService(new RankingProperties(new RankingProperties.WalkWeight(0.2, 0.5, 0.7),
                        0.20, 0.10, java.util.Set.of(), java.util.Set.of())), priceProvider, priceBandService);
    }

    /**
     * Routes only the nearest configured number of candidates. Places beyond that cap are not
     * checked against their real walking time and therefore cannot appear in this response.
     */
    public NearbyResponse findNearby(double lat, double lng, int maxWalkMin) {
        return findNearby(lat, lng, maxWalkMin, null, null, false);
    }

    public NearbyResponse findNearby(double lat, double lng, int maxWalkMin,
                                     java.math.BigDecimal minPrice, java.math.BigDecimal maxPrice,
                                     boolean includeUnknownPrice) {
        WeatherContext weather = weatherService.getContext(lat, lng);
        double effectiveRawLimitMinutes = maxWalkMin / weather.multiplier();
        double radiusMetres = effectiveRawLimitMinutes * oneMapProperties.walkSpeedMPerMin();
        List<PlaceDto> availablePlaces = placeProvider.getPlaces();
        int venuesSearched = placeProvider.venuesSearched();
        String venueCoverage = venuesSearched == 0 ? "unavailable" : placeProvider.venueCoverage();
        List<PlaceDto> candidates = availablePlaces.stream()
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
                double rawWalkMinutes = route.totalTimeSeconds() / 60.0;
                double adjustedWalkMinutes = rawWalkMinutes * weather.multiplier();
                if (adjustedWalkMinutes <= maxWalkMin) {
                    PriceBandService.PriceSummary price = priceSummary(place.id());
                    if (priceMatches(price, minPrice, maxPrice, includeUnknownPrice)) {
                        nearby.add(new NearbyPlaceDto(place.id(), place.name(), place.lat(), place.lng(),
                                rawWalkMinutes, adjustedWalkMinutes, 0.0, java.util.List.of(),
                                price.medianPrice(), price.priceBand(), price.priceSource(), price.priceReportCount()));
                    }
                }
            } catch (OneMapException e) {
                partial = true;
            }
        }
        nearby = new ArrayList<>(rankingService.rank(nearby, weather, maxWalkMin));
        NearbyWeatherDto weatherSummary = new NearbyWeatherDto(weather.status(), weather.forecastText(),
                weather.multiplier(), weatherService.assumptionText());
        return new NearbyResponse(partial ? "partial" : "complete", nearby, weatherSummary,
                venueCoverage, venuesSearched);
    }

    private PriceBandService.PriceSummary priceSummary(String venueId) {
        try {
            return priceBandService.summarize(priceProvider.getPrices(venueId));
        } catch (RuntimeException ignored) {
            return new PriceBandService.PriceSummary(null, null, PriceSource.UNKNOWN, 0);
        }
    }

    private static boolean priceMatches(PriceBandService.PriceSummary price,
                                        java.math.BigDecimal minPrice, java.math.BigDecimal maxPrice,
                                        boolean includeUnknownPrice) {
        boolean filtering = minPrice != null || maxPrice != null;
        if (!filtering || price.medianPrice() != null &&
                (minPrice == null || price.medianPrice().compareTo(minPrice) >= 0) &&
                (maxPrice == null || price.medianPrice().compareTo(maxPrice) <= 0)) return true;
        return includeUnknownPrice && price.medianPrice() == null;
    }

    private record Candidate(PlaceDto place, double distanceMetres) {}
}
