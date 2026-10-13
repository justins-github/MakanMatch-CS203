package com.makanmatch.context_service.DTO;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;

@JsonIgnoreProperties(ignoreUnknown = true)
public record CatalogVenueDto(String id, String name, String address, String postcode, Double lat, Double lon,
                              String cuisine, String category, String source, Double confidence,
                              Instant sourceUpdatedAt) {}
