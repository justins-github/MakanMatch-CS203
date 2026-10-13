package com.makanmatch.context_service.DTO;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.time.Instant;

@JsonIgnoreProperties(ignoreUnknown = true)
public record CatalogDishDto(String id, String venueId, String name, String source, boolean archived,
                             BigDecimal price, BigDecimal officialPrice, BigDecimal communityPrice,
                             boolean priceConflict, Instant lastPriceAt) {}
