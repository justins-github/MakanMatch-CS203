package com.makanmatch.context_service.provider;

import com.makanmatch.context_service.DTO.PlaceDto;
import com.makanmatch.context_service.DTO.CatalogVenueDto;
import com.makanmatch.context_service.service.VenueCacheService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@ConditionalOnProperty(name = "places.provider", havingValue = "catalog", matchIfMissing = true)
public class CatalogPlaceProvider implements PlaceProvider {
    private final VenueCacheService cache;
    private volatile int skippedVenueCount;

    public CatalogPlaceProvider(VenueCacheService cache) { this.cache = cache; }

    @Override
    public List<PlaceDto> getPlaces() {
        List<CatalogVenueDto> venues = cache.venues();
        skippedVenueCount = (int) venues.stream()
                .filter(v -> v.lat() == null || v.lon() == null)
                .count();
        return venues.stream()
                .filter(v -> v.id() != null && v.name() != null && v.lat() != null && v.lon() != null)
                .map(v -> new PlaceDto(v.id(), v.name(), v.lat(), v.lon()))
                .toList();
    }

    public int skippedVenueCount() { return skippedVenueCount; }

    @Override
    public String venueCoverage() { return cache.venueCoverage(); }

    @Override
    public int venuesSearched() { return cache.venuesSearched(); }
}
