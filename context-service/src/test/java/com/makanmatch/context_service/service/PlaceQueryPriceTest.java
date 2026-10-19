package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.CatalogDishDto;
import com.makanmatch.context_service.DTO.NearbyResponse;
import com.makanmatch.context_service.DTO.PlaceDto;
import com.makanmatch.context_service.DTO.RainCategory;
import com.makanmatch.context_service.DTO.WalkRouteDto;
import com.makanmatch.context_service.DTO.WeatherContext;
import com.makanmatch.context_service.config.OneMapProperties;
import com.makanmatch.context_service.config.PlacesProperties;
import com.makanmatch.context_service.config.PriceProperties;
import com.makanmatch.context_service.provider.PlaceProvider;
import com.makanmatch.context_service.provider.PriceProvider;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PlaceQueryPriceTest {
    @Test
    void filtersPricesExcludesUnknownByDefaultAndCanIncludeUnknown() {
        PlaceDto known = new PlaceDto("known", "Known", 1.3, 103.801);
        PlaceDto unknown = new PlaceDto("unknown", "Unknown", 1.3, 103.802);
        PriceProvider prices = venueId -> venueId.equals("known") ? List.of(dish("5", "DINER")) : List.of();
        PlaceQueryService service = service(List.of(known, unknown), prices);

        NearbyResponse filtered = service.findNearby(1.3, 103.8, 20, new BigDecimal("1"),
                new BigDecimal("10"), false);
        NearbyResponse included = service.findNearby(1.3, 103.8, 20, new BigDecimal("1"),
                new BigDecimal("10"), true);

        assertThat(filtered.places()).extracting("id").containsExactly("known");
        assertThat(included.places()).extracting("id").containsExactly("known", "unknown");
    }

    @Test
    void priceLookupFailureKeepsVenueAsUnknownAndRequestSucceeds() {
        PlaceDto place = new PlaceDto("broken", "Broken", 1.3, 103.801);
        PlaceQueryService service = service(List.of(place), venueId -> { throw new IllegalStateException("down"); });

        NearbyResponse response = service.findNearby(1.3, 103.8, 20);

        assertThat(response.places()).hasSize(1);
        assertThat(response.places().get(0).medianPrice()).isNull();
        assertThat(response.places().get(0).priceSource().name()).isEqualTo("UNKNOWN");
    }

    private static PlaceQueryService service(List<PlaceDto> places, PriceProvider prices) {
        PlaceProvider provider = () -> places;
        OneMapClient routes = new StubOneMapClient();
        WeatherService weather = new StubWeatherService();
        return new PlaceQueryService(provider, routes, new OneMapProperties("", "", "", 200),
                new PlacesProperties(15), weather, prices,
                new PriceBandService(new PriceProperties(BigDecimal.TEN, BigDecimal.valueOf(30))));
    }

    private static CatalogDishDto dish(String price, String source) {
        return new CatalogDishDto(price, "venue", "dish", source, false, new BigDecimal(price), null, null,
                false, Instant.EPOCH);
    }

    private static class StubOneMapClient extends OneMapClient {
        StubOneMapClient() { super(null, null); }
        @Override public WalkRouteDto getWalkRoute(double a, double b, double c, double d) {
            return new WalkRouteDto(60, 100);
        }
    }

    private static class StubWeatherService extends WeatherService {
        StubWeatherService() { super(null, null); }
        @Override public WeatherContext getContext(double lat, double lng) {
            return new WeatherContext(RainCategory.NONE, "Clear", "Test", 1.0, "available");
        }
        @Override public String assumptionText() { return "test"; }
    }
}
