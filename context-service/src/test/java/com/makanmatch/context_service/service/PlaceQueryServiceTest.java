package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.WalkRouteDto;
import com.makanmatch.context_service.config.OneMapProperties;
import com.makanmatch.context_service.config.PlacesProperties;
import com.makanmatch.context_service.DTO.NearbyResponse;
import com.makanmatch.context_service.DTO.PlaceDto;
import com.makanmatch.context_service.exception.OneMapException;
import com.makanmatch.context_service.provider.PlaceProvider;
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
        assertThat(response.places()).extracting("walkMinutes").containsExactly(2.0, 10.0);
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

    private static PlaceQueryService service(List<PlaceDto> places, OneMapClient client, int maxRouted,
                                            double speedMetresPerMinute) {
        PlaceProvider provider = () -> places;
        return new PlaceQueryService(provider, client,
                new OneMapProperties("", "", "", speedMetresPerMinute),
                new PlacesProperties(maxRouted));
    }
}
