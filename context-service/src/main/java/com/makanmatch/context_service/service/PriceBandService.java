package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.CatalogDishDto;
import com.makanmatch.context_service.DTO.PriceSource;
import com.makanmatch.context_service.config.PriceProperties;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;

@Service
public class PriceBandService {
    private final PriceProperties properties;

    public PriceBandService(PriceProperties properties) { this.properties = properties; }

    public PriceSummary summarize(List<CatalogDishDto> dishes) {
        List<CatalogDishDto> priced = dishes == null ? List.of() : dishes.stream()
                .filter(dish -> !dish.archived() && dish.price() != null)
                .toList();
        if (priced.isEmpty()) return new PriceSummary(null, null, PriceSource.UNKNOWN, 0);

        List<BigDecimal> prices = priced.stream().map(CatalogDishDto::price).sorted().toList();
        int middle = prices.size() / 2;
        BigDecimal median = prices.size() % 2 == 1
                ? prices.get(middle)
                : prices.get(middle - 1).add(prices.get(middle)).divide(BigDecimal.valueOf(2));
        String band = median.compareTo(properties.bandLowMax()) <= 0 ? "$"
                : median.compareTo(properties.bandMidMax()) <= 0 ? "$$" : "$$$";
        PriceSource source = priced.stream().anyMatch(d -> "OWNER".equalsIgnoreCase(d.source()))
                ? PriceSource.OWNER_VERIFIED
                : priced.stream().anyMatch(d -> "DINER".equalsIgnoreCase(d.source()))
                ? PriceSource.CROWD_ESTIMATED : PriceSource.SEED_ONLY;
        return new PriceSummary(median, band, source, priced.size());
    }

    public record PriceSummary(BigDecimal medianPrice, String priceBand, PriceSource priceSource,
                               int priceReportCount) {}
}
