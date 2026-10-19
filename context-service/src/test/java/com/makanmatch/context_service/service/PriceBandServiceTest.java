package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.CatalogDishDto;
import com.makanmatch.context_service.DTO.PriceSource;
import com.makanmatch.context_service.config.PriceProperties;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PriceBandServiceTest {
    private final PriceBandService service = new PriceBandService(
            new PriceProperties(BigDecimal.TEN, BigDecimal.valueOf(30)));

    @Test
    void calculatesOddEvenSingleAndZeroMedians() {
        assertThat(service.summarize(List.of(dish("1", "5"), dish("2", "10"), dish("3", "15"))).medianPrice())
                .isEqualByComparingTo("10");
        assertThat(service.summarize(List.of(dish("1", "5"), dish("2", "15"))).medianPrice())
                .isEqualByComparingTo("10");
        assertThat(service.summarize(List.of(dish("1", "12"))).medianPrice()).isEqualByComparingTo("12");
        assertThat(service.summarize(List.of()).medianPrice()).isNull();
    }

    @Test
    void appliesBandBoundaries() {
        assertThat(service.summarize(List.of(dish("1", "9.99"))).priceBand()).isEqualTo("$");
        assertThat(service.summarize(List.of(dish("1", "10.00"))).priceBand()).isEqualTo("$");
        assertThat(service.summarize(List.of(dish("1", "10.01"))).priceBand()).isEqualTo("$$");
        assertThat(service.summarize(List.of(dish("1", "29.99"))).priceBand()).isEqualTo("$$");
        assertThat(service.summarize(List.of(dish("1", "30.00"))).priceBand()).isEqualTo("$$");
        assertThat(service.summarize(List.of(dish("1", "30.01"))).priceBand()).isEqualTo("$$$");
    }

    @Test
    void prioritizesOwnerThenDinerThenSeedSources() {
        assertThat(service.summarize(List.of(dish("1", "5", "SEED"), dish("2", "6", "DINER"))).priceSource())
                .isEqualTo(PriceSource.CROWD_ESTIMATED);
        assertThat(service.summarize(List.of(dish("1", "5", "OWNER"), dish("2", "6", "DINER"))).priceSource())
                .isEqualTo(PriceSource.OWNER_VERIFIED);
        assertThat(service.summarize(List.of(dish("1", "5", "SEED"))).priceSource())
                .isEqualTo(PriceSource.SEED_ONLY);
        assertThat(service.summarize(List.of()).priceSource()).isEqualTo(PriceSource.UNKNOWN);
    }

    private static CatalogDishDto dish(String id, String price) { return dish(id, price, "SEED"); }

    private static CatalogDishDto dish(String id, String price, String source) {
        return new CatalogDishDto(id, "venue", id, source, false, new BigDecimal(price), null, null,
                false, Instant.EPOCH);
    }
}
