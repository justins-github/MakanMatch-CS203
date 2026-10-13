package com.makanmatch.context_service.provider;

import com.makanmatch.context_service.DTO.PlaceDto;
import com.makanmatch.context_service.service.VenueCacheService;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.List;

@Primary
@Component
public class CatalogPlaceProvider implements PlaceProvider {
    private final VenueCacheService cache;

    public CatalogPlaceProvider(VenueCacheService cache) { this.cache = cache; }

    @Override
    public List<PlaceDto> getPlaces() {
        return cache.venues().stream()
                .filter(v -> v.id() != null && v.name() != null && v.lat() != null && v.lon() != null)
                .map(v -> new PlaceDto(v.id(), v.name(), v.lat(), v.lon()))
                .toList();
    }
}
