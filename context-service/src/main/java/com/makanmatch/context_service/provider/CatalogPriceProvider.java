package com.makanmatch.context_service.provider;

import com.makanmatch.context_service.client.CatalogServiceClient;
import com.makanmatch.context_service.DTO.CatalogDishDto;
import org.springframework.stereotype.Component;

import java.util.List;

/** Fetches dish prices only after a venue has been shortlisted. */
@Component
public class CatalogPriceProvider implements PriceProvider {
    private final CatalogServiceClient client;

    public CatalogPriceProvider(CatalogServiceClient client) { this.client = client; }

    @Override
    public List<CatalogDishDto> getPrices(String venueId) { return client.getDishes(venueId); }
}
