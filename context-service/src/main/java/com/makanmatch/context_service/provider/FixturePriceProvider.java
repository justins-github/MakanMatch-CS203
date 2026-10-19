package com.makanmatch.context_service.provider;

import com.makanmatch.context_service.DTO.CatalogDishDto;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Profile("test")
@ConditionalOnProperty(name = "prices.provider", havingValue = "fixture")
public class FixturePriceProvider implements PriceProvider {
    @Override
    public List<CatalogDishDto> getPrices(String venueId) { return List.of(); }
}
