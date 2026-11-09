package com.makanmatch.context_service.service;

import com.makanmatch.context_service.client.CatalogServiceClient;
import com.makanmatch.context_service.DTO.CatalogVenueDto;
import com.makanmatch.context_service.DTO.OpeningHoursDto;
import com.makanmatch.context_service.DTO.VenueStatusDto;
import com.makanmatch.context_service.exception.CatalogServiceException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Catalog venues, loaded on first use and reloaded once older than
 * {@code catalog.refresh-ms}. Loading lazily (not at startup or on a timer)
 * keeps startup fast and stops a weather-only request from waking
 * catalog-service: on Vercel an idle instance is paused, so a timer would not
 * fire reliably anyway.
 */
@Service
public class VenueCacheService {
    private static final Logger log = LoggerFactory.getLogger(VenueCacheService.class);
    private static final String BOOTSTRAP_QUERY = "an";
    // After a failed load (e.g. catalog-service still starting), try again soon.
    private static final Duration RETRY_AFTER_FAILURE = Duration.ofSeconds(30);

    private final CatalogServiceClient client;
    private final Duration maxAge;
    private final Clock clock;
    private volatile List<CatalogVenueDto> venues = List.of();
    private volatile Instant lastRefreshedAt;
    private volatile String lastRefreshError;
    private volatile Instant nextRefreshAt = Instant.MIN;

    @Autowired
    public VenueCacheService(CatalogServiceClient client, @Value("${catalog.refresh-ms:900000}") long refreshMs) {
        this(client, Duration.ofMillis(refreshMs), Clock.systemUTC());
    }

    VenueCacheService(CatalogServiceClient client, Duration maxAge, Clock clock) {
        this.client = client;
        this.maxAge = maxAge;
        this.clock = clock;
    }

    public synchronized void refresh() {
        try {
            /*
             * The current catalog endpoint requires q and caps each search at 25;
             * it has no page/offset or all-venues endpoint. Consequently this
             * bootstrap query is intentionally observable as query-scoped and is
             * a known limitation until catalog-service adds a bulk endpoint.
             */
            venues = List.copyOf(client.searchVenues(BOOTSTRAP_QUERY, 200));
            lastRefreshedAt = clock.instant();
            lastRefreshError = null;
            nextRefreshAt = lastRefreshedAt.plus(maxAge);
            log.info("Loaded {} catalog venues; upstream search is capped and query-scoped", venues.size());
        } catch (CatalogServiceException e) {
            failed(e.getMessage(), e);
        } catch (RuntimeException e) {
            failed("Catalog refresh failed: " + e.getMessage(), e);
        }
    }

    private void failed(String message, RuntimeException e) {
        lastRefreshError = message;
        nextRefreshAt = clock.instant().plus(RETRY_AFTER_FAILURE);
        log.warn("Catalog venue refresh failed; serving {} previously cached venues", venues.size(), e);
    }

    /** The cached venues, (re)loading them first when missing or stale. */
    public List<CatalogVenueDto> venues() {
        if (!clock.instant().isBefore(nextRefreshAt)) {
            synchronized (this) {
                // Another request may have reloaded while this one waited.
                if (!clock.instant().isBefore(nextRefreshAt)) refresh();
            }
        }
        return venues;
    }

    public int venuesSearched() { return venues.size(); }

    /**
     * The catalog search endpoint currently returns at most 25 query-scoped venues,
     * so every non-empty cache is partial until a bulk endpoint is available.
     */
    public String venueCoverage() { return venues.isEmpty() ? "unavailable" : "partial"; }

    public Instant lastRefreshedAt() { return lastRefreshedAt; }
    public String lastRefreshError() { return lastRefreshError; }

    public CacheStatus status() {
        return new CacheStatus(venues.size(), lastRefreshedAt, lastRefreshError,
                lastRefreshedAt == null ? "unavailable" : "available");
    }

    public Map<String, VenueStatusDto> statuses() {
        return client.getVenueStatuses().stream().collect(Collectors.toMap(VenueStatusDto::venueId,
                Function.identity(), (first, ignored) -> first));
    }

    public Map<String, OpeningHoursDto> hours() {
        return client.getVenueHours().stream().collect(Collectors.toMap(OpeningHoursDto::venueId,
                Function.identity(), (first, ignored) -> first));
    }

    public record CacheStatus(int venueCount, Instant lastRefreshedAt, String lastRefreshError, String status) {}
}
