package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.WalkRouteDto;
import com.makanmatch.context_service.DTO.CatalogVenueDto;
import com.makanmatch.context_service.config.OneMapProperties;
import com.makanmatch.context_service.config.PlacesProperties;
import com.makanmatch.context_service.client.NeaWeatherClient;
import com.makanmatch.context_service.config.WeatherProperties;
import com.makanmatch.context_service.DTO.NearbyResponse;
import com.makanmatch.context_service.DTO.PlaceDto;
import com.makanmatch.context_service.DTO.RainCategory;
import com.makanmatch.context_service.DTO.WeatherContext;
import com.makanmatch.context_service.exception.OneMapException;
import com.makanmatch.context_service.exception.NeaException;
import com.makanmatch.context_service.provider.PlaceProvider;
import com.makanmatch.context_service.provider.CatalogPlaceProvider;
import com.makanmatch.context_service.provider.FixturePlaceProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class PlaceQueryServiceTest {
    private static final double ORIGIN_LAT = 1.3;
    private static final double ORIGIN_LNG = 103.8;

    @Test
    void routesNearestCappedCandidatesFiltersByActualTimeAndSortsByRouteTime() {
        PlaceDto nearest = new PlaceDto("near", "Nearest", ORIGIN_LAT, ORIGIN_LNG + 0.001);
        PlaceDto second = new PlaceDto("second", "Second", ORIGIN_LAT, ORIGIN_LNG + 0.002);
        PlaceDto third = new PlaceDto("third", "Third", ORIGIN_LAT, ORIGIN_LNG + 0.003);
        PlaceDto beyondCap = new PlaceDto("fourth", "Fourth", ORIGIN_LAT, ORIGIN_LNG + 0.004);
        OneMapClient client = mock(OneMapClient.class);
        PlaceQueryService service = service(List.of(beyondCap, third, second, nearest), client, 3, 200);
        when(client.getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, nearest.lat(), nearest.lng()))
                .thenReturn(new WalkRouteDto(600, 1_000));
        when(client.getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, second.lat(), second.lng()))
                .thenReturn(new WalkRouteDto(601, 1_000));
        when(client.getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, third.lat(), third.lng()))
                .thenReturn(new WalkRouteDto(120, 1_000));

        NearbyResponse response = service.findNearby(ORIGIN_LAT, ORIGIN_LNG, 10);

        assertThat(response.routingStatus()).isEqualTo("complete");
        assertThat(response.places()).extracting("id").containsExactly("third", "near");
        assertThat(response.places()).extracting("adjustedWalkMinutes").containsExactly(2.0, 10.0);
        verify(client).getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, nearest.lat(), nearest.lng());
        verify(client).getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, second.lat(), second.lng());
        verify(client).getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, third.lat(), third.lng());
        verifyNoMoreInteractions(client);
    }

    @Test
    void skipsFailedRouteAndMarksResponsePartial() {
        PlaceDto failed = new PlaceDto("failed", "Failed", ORIGIN_LAT, ORIGIN_LNG + 0.001);
        PlaceDto successful = new PlaceDto("ok", "Successful", ORIGIN_LAT, ORIGIN_LNG + 0.002);
        OneMapClient client = mock(OneMapClient.class);
        PlaceQueryService service = service(List.of(failed, successful), client, 15, 200);
        when(client.getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, failed.lat(), failed.lng()))
                .thenThrow(new OneMapException("simulated route failure"));
        when(client.getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, successful.lat(), successful.lng()))
                .thenReturn(new WalkRouteDto(240, 500));

        NearbyResponse response = service.findNearby(ORIGIN_LAT, ORIGIN_LNG, 10);

        assertThat(response.routingStatus()).isEqualTo("partial");
        assertThat(response.places()).extracting("id").containsExactly("ok");
    }

    @Test
    void rainMultiplierShrinksLimitAndExcludesFourteenRawMinutesFromFifteenMinuteLimit() {
        PlaceDto fourteenMinutePlace = new PlaceDto("rainy", "Rainy Route", ORIGIN_LAT, ORIGIN_LNG + 0.001);
        PlaceDto boundaryPlace = new PlaceDto("boundary", "Boundary Route", ORIGIN_LAT, ORIGIN_LNG + 0.002);
        OneMapClient client = mock(OneMapClient.class);
        WeatherService weather = mock(WeatherService.class);
        when(weather.getContext(ORIGIN_LAT, ORIGIN_LNG)).thenReturn(
                new WeatherContext(RainCategory.LIGHT, "Light Rain", "Bishan", 1.25, "available"));
        when(weather.assumptionText()).thenReturn("Rain multipliers are configurable assumptions.");
        PlaceQueryService service = service(List.of(fourteenMinutePlace, boundaryPlace), client, 15, 80, weather);
        when(client.getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, fourteenMinutePlace.lat(), fourteenMinutePlace.lng()))
                .thenReturn(new WalkRouteDto(14 * 60, 1_100));
        when(client.getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, boundaryPlace.lat(), boundaryPlace.lng()))
                .thenReturn(new WalkRouteDto(12 * 60, 900));

        NearbyResponse response = service.findNearby(ORIGIN_LAT, ORIGIN_LNG, 15);

        assertThat(response.places()).extracting("id").containsExactly("boundary");
        assertThat(response.places().get(0).rawWalkMinutes()).isEqualTo(12.0);
        assertThat(response.places().get(0).adjustedWalkMinutes()).isEqualTo(15.0);
        assertThat(response.weather().multiplier()).isEqualTo(1.25);
        verify(client).getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, fourteenMinutePlace.lat(), fourteenMinutePlace.lng());
    }

    @Test
    void neaFailureKeepsNearbyRequestSuccessfulWithNeutralWeather() {
        PlaceDto place = new PlaceDto("place", "Place", ORIGIN_LAT, ORIGIN_LNG + 0.001);
        OneMapClient oneMapClient = mock(OneMapClient.class);
        NeaWeatherClient neaClient = mock(NeaWeatherClient.class);
        when(neaClient.getLatestForecast()).thenThrow(new NeaException("simulated NEA outage"));
        WeatherService weather = new WeatherService(neaClient,
                new WeatherProperties(new WeatherProperties.RainMultiplier(1.25, 1.4)),
                new org.springframework.cache.concurrent.ConcurrentMapCacheManager("weather"));
        when(oneMapClient.getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, place.lat(), place.lng()))
                .thenReturn(new WalkRouteDto(300, 500));
        PlaceQueryService service = service(List.of(place), oneMapClient, 15, 200, weather);

        NearbyResponse response = service.findNearby(ORIGIN_LAT, ORIGIN_LNG, 10);

        assertThat(response.routingStatus()).isEqualTo("complete");
        assertThat(response.places()).extracting("id").containsExactly("place");
        assertThat(response.weather().status()).isEqualTo("unavailable");
        assertThat(response.weather().multiplier()).isEqualTo(1.0);
    }

    @Test
    void partialProviderCoverageIsReturnedWithSearchCount() {
        PlaceDto place = new PlaceDto("place", "Place", ORIGIN_LAT, ORIGIN_LNG + 0.001);
        PlaceProvider provider = new PlaceProvider() {
            @Override public List<PlaceDto> getPlaces() { return List.of(place); }
            @Override public String venueCoverage() { return "partial"; }
            @Override public int venuesSearched() { return 25; }
        };
        OneMapClient client = mock(OneMapClient.class);
        when(client.getWalkRoute(ORIGIN_LAT, ORIGIN_LNG, place.lat(), place.lng()))
                .thenReturn(new WalkRouteDto(60, 100));
        PlaceQueryService service = new PlaceQueryService(provider, client,
                new OneMapProperties("", "", "", 200), new PlacesProperties(15),
                mockWeather(RainCategory.NONE, 1.0));

        NearbyResponse response = service.findNearby(ORIGIN_LAT, ORIGIN_LNG, 10);

        assertThat(response.venueCoverage()).isEqualTo("partial");
        assertThat(response.venuesSearched()).isEqualTo(25);
    }

    @Test
    void emptyProviderReturnsUnavailableCoverageAndNoResults() {
        OneMapClient client = mock(OneMapClient.class);
        PlaceQueryService service = service(List.of(), client, 15, 200);

        NearbyResponse response = service.findNearby(ORIGIN_LAT, ORIGIN_LNG, 10);

        assertThat(response.places()).isEmpty();
        assertThat(response.venueCoverage()).isEqualTo("unavailable");
        assertThat(response.venuesSearched()).isZero();
    }

    @Test
    void catalogProviderSkipsVenueWithNullCoordinates() {
        VenueCacheService cache = mock(VenueCacheService.class);
        when(cache.venues()).thenReturn(List.of(
                new CatalogVenueDto("ok", "Valid", "", "", ORIGIN_LAT, ORIGIN_LNG, "", "", "", null, null),
                new CatalogVenueDto("missing", "Missing", "", "", null, ORIGIN_LNG, "", "", "", null, null)));
        CatalogPlaceProvider provider = new CatalogPlaceProvider(cache);

        assertThat(provider.getPlaces()).extracting("id").containsExactly("ok");
        assertThat(provider.skippedVenueCount()).isEqualTo(1);
    }

    @Test
    void providerAnnotationsSelectCatalogByDefaultAndFixtureInTestProfile() {
        ConditionalOnProperty catalogCondition = CatalogPlaceProvider.class.getAnnotation(ConditionalOnProperty.class);
        ConditionalOnProperty fixtureCondition = FixturePlaceProvider.class.getAnnotation(ConditionalOnProperty.class);

        assertThat(catalogCondition.havingValue()).isEqualTo("catalog");
        assertThat(fixtureCondition.havingValue()).isEqualTo("fixture");
        assertThat(FixturePlaceProvider.class.getAnnotation(Profile.class).value()).contains("test");
    }

    private static PlaceQueryService service(List<PlaceDto> places, OneMapClient client, int maxRouted,
                                            double speedMetresPerMinute) {
        return service(places, client, maxRouted, speedMetresPerMinute, mockWeather(RainCategory.NONE, 1.0));
    }

    private static PlaceQueryService service(List<PlaceDto> places, OneMapClient client, int maxRouted,
                                            double speedMetresPerMinute, WeatherService weather) {
        PlaceProvider provider = () -> places;
        return new PlaceQueryService(provider, client,
                new OneMapProperties("", "", "", speedMetresPerMinute),
                new PlacesProperties(maxRouted), weather);
    }

    private static WeatherService mockWeather(RainCategory category, double multiplier) {
        WeatherService weather = mock(WeatherService.class);
        when(weather.getContext(ORIGIN_LAT, ORIGIN_LNG)).thenReturn(
                new WeatherContext(category, "Clear", "City", multiplier, "available"));
        when(weather.assumptionText()).thenReturn("Rain multipliers are configurable assumptions.");
        return weather;
    }
}
