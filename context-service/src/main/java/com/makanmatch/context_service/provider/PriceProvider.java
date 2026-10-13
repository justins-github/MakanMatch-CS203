package com.makanmatch.context_service.provider;

import com.makanmatch.context_service.DTO.CatalogDishDto;
import java.util.List;

public interface PriceProvider {
    List<CatalogDishDto> getPrices(String venueId);
}
