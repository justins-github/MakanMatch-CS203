package com.makanmatch.catalog_service.menu.dto;

import java.math.BigDecimal;

/** A venue's typical price: the median shown price of its live dishes (CSD-51). */
public record VenuePriceResponse(String venueId, BigDecimal typicalPrice) {
}
