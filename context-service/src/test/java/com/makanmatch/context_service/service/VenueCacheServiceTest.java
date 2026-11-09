package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.CatalogVenueDto;
import com.makanmatch.context_service.client.CatalogServiceClient;
import com.makanmatch.context_service.exception.CatalogServiceException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class VenueCacheServiceTest {
    private static final Duration MAX_AGE = Duration.ofMinutes(15);

    private final CatalogServiceClient client = mock(CatalogServiceClient.class);
    private final MutableClock clock = new MutableClock();
    private final VenueCacheService cache = new VenueCacheService(client, MAX_AGE, clock);

    @Test
    void startingUpDoesNotCallCatalogService() {
        verify(client, never()).searchVenues(anyString(), anyInt());
        assertThat(cache.status().status()).isEqualTo("unavailable");
    }

    @Test
    void loadsOnFirstUseAndReusesUntilStale() {
        when(client.searchVenues(anyString(), anyInt())).thenReturn(List.of(venue("v1")));

        assertThat(cache.venues()).hasSize(1);
        clock.advance(MAX_AGE.minusSeconds(1));
        cache.venues();
        verify(client, times(1)).searchVenues(anyString(), anyInt());

        clock.advance(Duration.ofSeconds(1));
        cache.venues();
        verify(client, times(2)).searchVenues(anyString(), anyInt());
    }

    @Test
    void afterAFailureRetriesSoonInsteadOfWaitingTheFullInterval() {
        when(client.searchVenues(anyString(), anyInt()))
                .thenThrow(new CatalogServiceException("catalog-service still starting"))
                .thenReturn(List.of(venue("v1")));

        assertThat(cache.venues()).isEmpty();
        assertThat(cache.status().lastRefreshError()).contains("still starting");
        cache.venues();
        verify(client, times(1)).searchVenues(anyString(), anyInt());

        clock.advance(Duration.ofSeconds(30));
        assertThat(cache.venues()).hasSize(1);
        assertThat(cache.status().status()).isEqualTo("available");
    }

    private static CatalogVenueDto venue(String id) {
        return new CatalogVenueDto(id, "Venue " + id, null, null, 1.3, 103.8, null, null, null, null, null);
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-09T08:00:00Z");

        void advance(Duration duration) { now = now.plus(duration); }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
