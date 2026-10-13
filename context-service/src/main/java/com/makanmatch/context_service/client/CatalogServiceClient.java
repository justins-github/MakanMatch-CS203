package com.makanmatch.context_service.client;

import com.makanmatch.context_service.DTO.CatalogDishDto;
import com.makanmatch.context_service.DTO.CatalogVenueDto;
import com.makanmatch.context_service.DTO.OpeningHoursDto;
import com.makanmatch.context_service.DTO.VenueStatusDto;
import com.makanmatch.context_service.exception.CatalogServiceException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Arrays;
import java.util.List;

@Component
public class CatalogServiceClient {
    private final RestClient restClient;

    public CatalogServiceClient(@Qualifier("catalogRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    public List<CatalogVenueDto> searchVenues(String query, int limit) {
        return getList("venue search", restClient.get().uri(uri -> uri.path("/api/catalog/venues")
                .queryParam("q", query).queryParam("limit", limit).build()), CatalogVenueDto[].class);
    }

    public CatalogVenueDto getVenue(String venueId) {
        return get("venue " + venueId, restClient.get().uri("/api/catalog/venues/{id}", venueId), CatalogVenueDto.class);
    }

    @Cacheable(cacheNames = "catalogVenueStatuses")
    public List<VenueStatusDto> getVenueStatuses() {
        return getList("venue statuses", restClient.get().uri("/api/catalog/venue-status"), VenueStatusDto[].class);
    }

    @Cacheable(cacheNames = "catalogVenueHours")
    public List<OpeningHoursDto> getVenueHours() {
        return getList("venue hours", restClient.get().uri("/api/catalog/venue-hours"), OpeningHoursDto[].class);
    }

    @Cacheable(cacheNames = "catalogPrices", key = "#venueId")
    public List<CatalogDishDto> getDishes(String venueId) {
        return getList("dishes for venue " + venueId,
                restClient.get().uri("/api/catalog/venues/{venueId}/dishes", venueId), CatalogDishDto[].class);
    }

    private <T> T get(String description, RestClient.RequestHeadersSpec<?> request, Class<T> type) {
        try {
            return request.retrieve().onStatus(HttpStatusCode::isError,
                    (httpRequest, response) -> { throw new CatalogServiceException(description + " returned HTTP " + response.getStatusCode()); })
                    .body(type);
        } catch (CatalogServiceException e) {
            throw e;
        } catch (RestClientException e) {
            throw new CatalogServiceException("Catalog data unavailable: " + description, e);
        }
    }

    private <T> List<T> getList(String description, RestClient.RequestHeadersSpec<?> request, Class<T[]> type) {
        T[] values = get(description, request, type);
        return values == null ? List.of() : List.copyOf(Arrays.asList(values));
    }
}
