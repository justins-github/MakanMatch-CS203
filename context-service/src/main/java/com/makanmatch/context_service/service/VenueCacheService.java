package com.makanmatch.context_service.service;

import com.makanmatch.context_service.client.CatalogServiceClient;
import com.makanmatch.context_service.DTO.CatalogVenueDto;
import com.makanmatch.context_service.DTO.OpeningHoursDto;
import com.makanmatch.context_service.DTO.VenueStatusDto;
import com.makanmatch.context_service.exception.CatalogServiceException;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class VenueCacheService {
    private static final Logger log = LoggerFactory.getLogger(VenueCacheService.class);
    private static final String BOOTSTRAP_QUERY = "an";
    private final CatalogServiceClient client;
    private volatile List<CatalogVenueDto> venues = List.of();
    private volatile Instant lastRefreshedAt;
    private volatile String lastRefreshError;

    public VenueCacheService(CatalogServiceClient client) { this.client = client; }

    @PostConstruct
    public void populateOnStartup() { refresh(); }

    @Scheduled(fixedDelayString = "${catalog.refresh-ms:900000}")
    public void refresh() {
        try {
            /*
             * The current catalog endpoint requires q and caps each search at 25;
             * it has no page/offset or all-venues endpoint. Consequently this
             * bootstrap query is intentionally observable as query-scoped and is
             * a known limitation until catalog-service adds a bulk endpoint.
             */
            venues = List.copyOf(client.searchVenues(BOOTSTRAP_QUERY, 200));
            lastRefreshedAt = Instant.now();
            lastRefreshError = null;
            log.info("Loaded {} catalog venues; upstream search is capped and query-scoped", venues.size());
        } catch (CatalogServiceException e) {
            lastRefreshError = e.getMessage();
            log.warn("Catalog venue refresh failed; serving {} previously cached venues", venues.size(), e);
        } catch (RuntimeException e) {
            lastRefreshError = "Catalog refresh failed: " + e.getMessage();
            log.warn("Catalog venue refresh failed; serving {} previously cached venues", venues.size(), e);
        }
    }

    public List<CatalogVenueDto> venues() { return venues; }
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
